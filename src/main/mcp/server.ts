import { isCliProvider, CLI_IDS, CLI_DEFINITIONS, cliSupportsMode, type CliRequestOptions } from '../../shared/cli.js';
import { globalCliRuntime } from '../cli/cliRuntimeManager.js';
import express, { Request, Response } from 'express';
import cors from 'cors';
import http from 'http';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { globalBlindingEngine } from '../security/dataBlinding.js';
import { globalLogStorage } from '../storage/logStorage.js';
import { DynamicRouter } from './router.js';
import { globalRateLimiter } from './rateLimiter.js';
import { globalSessionManager } from '../webviews/sessionManager.js';
import { globalAssetManager } from '../storage/assetManager.js';
import { ModelRegistryManager } from '../registry/modelRegistry.js';
import { ModelScraperEngine } from '../registry/modelScrapers.js';
import { AccountRegistryManager } from '../registry/accountRegistry.js';
import { ServiceManifestManager } from '../registry/serviceManifest.js';
import {
  wrapBalancedCodingPrompt,
  wrapBalancedAgenticPrompt,
  wrapBalancedLocalLlmPrompt,
  wrapUnbalancedAgenticPrompt,
  formatBalancedLocalLlmDirective,
  formatBalancedWebAiDirective,
  formatLocalLlmDecisionReminder,
  formatWebAiDecisionReminder,
  formatUnbalancedAgenticReminder,
  formatCodexFallbackDirective,
} from './handlers/codingHandler.js';
import {
  formatBalancedDoubleAgentDirective,
  formatDualDispatchDoubleAgentDirective,
  formatDualPerspectiveResponse,
  executeConcurrentDualDispatch,
  determineDispatchScenario,
  getProviderDisplayName,
} from './dispatchPipeline.js';
import { classifyMicroTask } from './handlers/microTaskClassifier.js';
import { applyRecallPipeline } from './handlers/recallHandler.js';
import {
  formatAgentHaltDirective,
  estimateCooldownString,
  emitRateLimitNotification,
  createAgentHaltResponse,
} from './handlers/errorHandler.js';
import { globalThreadManager } from '../registry/threadManager.js';
import { SseTransportManager } from './sseTransport.js';
import { BaseMcpHandler } from './handlers/baseHandler.js';
import { ClientAuthManager } from '../security/clientAuth.js';
import { AccountQueueManager } from '../queue/accountQueue.js';
import { DuplicateActionGuard } from '../security/duplicateActionGuard.js';
import { CookieSyncManager } from '../auth/cookieSyncServer.js';
import { createRecipeRouter } from '../auth/recipeSyncServer.js';
import { LocalLlmClient } from '../localllm/localLlmClient.js';
import { CallerContext, ResponseProfile, inferResponseProfile, parseResponseProfile, throwIfCancelled } from './clientContext.js';
import { ProviderOutcome, withResponseDetails } from './responseEnvelope.js';
import { globalLocalZeroLeakManager } from '../localllm/localZeroLeak.js';
import { globalLocalCompactManager } from '../localllm/localCompact.js';
import {
  CoreStatus,
  McpRequestLog,
  ProviderId,
  TaskMode,
  AcceptedTaskMode,
  TaskIntent,
  TransgenticConfig,
  AUDIO_MODE_UNAVAILABLE_MESSAGE,
  normalizeTaskMode,
  isAgentHaltGuardEnabled,
  isRecallEnabledForMode,
} from '../../shared/types.js';
import { getExtensionDownloadUrl } from '../../shared/release.js';
import { app as electronApp } from 'electron';
import { CompletionGateway } from '../completion/completionGateway.js';
import { AttachmentManager, attachmentLogSummary } from '../attachments/attachmentManager.js';
import type { AttachmentKind, NormalizedRequestEnvelope, StagedAttachment } from '../../shared/attachments.js';

interface SseClient {
  id: string;
  res: Response;
  targetProvider?: ProviderId;
}

export class TransgenticMcpServer {
  private app: express.Application;
  private httpServer: http.Server | null = null;
  private port: number = 58420;
  private clients: Map<string, SseClient> = new Map();
  private requestLogs: McpRequestLog[] = [];
  private requestCounter: number = 0;
  private startTime: number = Date.now();
  private currentMode: TaskMode = 'general';
  private currentCoreState: CoreStatus['state'] = 'idle';
  private activeProvider?: ProviderId;
  private currentTaskDescription?: string;
  private config: TransgenticConfig | null = null;
  private completionGateway = new CompletionGateway(() => this.config, () => this.port);
  private activeAbortControllers: Map<string, AbortController> = new Map();
  private clientProfiles = new Map<string, { profile: ResponseProfile; lastUsed: number }>();

  private logListeners: Array<(log: McpRequestLog) => void> = [];
  private coreStatusListeners: Array<(status: CoreStatus) => void> = [];

  constructor(preferredPort: number = 58420) {
    this.port = preferredPort;
    this.app = express();
    this.app.use(
      cors({
        origin: '*',
        methods: ['GET', 'POST', 'OPTIONS', 'DELETE', 'PUT'],
        allowedHeaders: ['Content-Type', 'Authorization', 'mcp-session-id', 'Mcp-Session-Id', 'Accept', 'Last-Event-ID'],
        exposedHeaders: ['mcp-session-id', 'Mcp-Session-Id', 'Content-Type'],
      })
    );
    // 100 MB decoded attachments can expand by ~4/3 when transported as base64 JSON.
    this.app.use(express.json({ limit: '140mb' }));
    this.app.use((req, res, next) => {
      const localOnly = req.path.startsWith('/api/auth/') || req.path.startsWith('/api/recipes');
      const remote = req.socket.remoteAddress || '';
      const loopback = remote === '127.0.0.1' || remote === '::1' || remote === '::ffff:127.0.0.1';
      if (localOnly && !loopback) { res.status(403).json({ error: 'This administration endpoint is available only on the Transgentic machine.' }); return; }
      next();
    });
    this.setupRoutes();
  }

  public updateConfig(cfg: TransgenticConfig): void {
    this.config = cfg;
    globalCliRuntime.setConfig(cfg.cli);
    if (cfg.localLLM) {
      DynamicRouter.setLocalLlmConfig(cfg.localLLM);
    }
  }

  private setupRoutes(): void {
    // Health & Info (Unauthenticated with CORS enabled for local pre-flight checks)
    this.app.options(['/api/health', '/health'], (req, res) => {
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
      res.sendStatus(204);
    });

    this.app.get(['/api/health', '/health'], (req, res) => {
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.json({
        status: 'online',
        version: '1.0',
        activePort: this.port,
        name: 'transgentic-mcp-server',
        port: this.port,
        completionBaseUrl: `/v1`,
      });
    });

    // Safe Session Receiver & Multi-Account Endpoints (CORS enabled for browser origins & extensions)
    this.app.options('/api/auth/presets', (req, res) => {
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
      res.sendStatus(204);
    });

    this.app.get('/api/auth/presets', (req, res) => {
      res.setHeader('Access-Control-Allow-Origin', '*');
      try {
        const presets = ServiceManifestManager.getAvailablePreconfigs();
        res.json({ success: true, presets });
      } catch (err: any) {
        res.status(500).json({ success: false, error: err.message });
      }
    });

    this.app.options('/api/auth/sync-session', (req, res) => {
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
      res.sendStatus(204);
    });

    this.app.post('/api/auth/sync-session', async (req, res) => {
      res.setHeader('Access-Control-Allow-Origin', '*');
      try {
        const result = await CookieSyncManager.syncSession(req.body);
        res.json(result);
      } catch (err: any) {
        res.status(400).json({
          success: false,
          error: err.message || 'Failed to synchronize session',
        });
      }
    });

    this.app.options('/api/auth/accounts', (req, res) => {
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
      res.sendStatus(204);
    });

    this.app.get('/api/auth/accounts', (req, res) => {
      res.setHeader('Access-Control-Allow-Origin', '*');
      try {
        const provider = req.query.provider as string | undefined;
        if (provider) {
          const norm = CookieSyncManager.normalizeProviderId(provider);
          return res.json(AccountRegistryManager.getForProvider(norm));
        }
        return res.json(AccountRegistryManager.getAll());
      } catch (err: any) {
        res.status(400).json({ error: err.message });
      }
    });

    this.app.get('/api/auth/download-extension', (req, res) => {
      res.setHeader('Access-Control-Allow-Origin', '*');
      const candidates = [
        path.join(process.resourcesPath || '', 'extensions', 'transgentic-sync-v1.2.0.zip'),
        path.join(process.cwd(), 'extensions', 'transgentic-sync-v1.2.0.zip'),
      ];
      for (const p of candidates) {
        if (fs.existsSync(p)) {
          return res.download(p, path.basename(p));
        }
      }
      res.redirect(302, getExtensionDownloadUrl(electronApp.getVersion()));
    });

    // Custom Recipe & Selector Wizard Endpoints
    this.app.use('/api/recipes', createRecipeRouter());

    // MCP Client Authentication Middleware (Applied to all MCP protocol & provider routes)
    this.app.use((req, res, next) => {
      const p = req.originalUrl || req.url || req.path || '';
      if (req.path === '/health' || p.startsWith('/health') || p.startsWith('/api/auth/') || p.startsWith('/api/recipes') || p.startsWith('/api/health')) return next();

      // Check if this request is part of an already authenticated active SSE session
      const sessionId = (req.query.sessionId as string) || (req.headers['mcp-session-id'] as string) || '';
      if (sessionId && SseTransportManager.getClient(sessionId)) {
        return next();
      }

      const authHeader = req.headers['authorization'];
      let token: string | undefined;
      if (authHeader && typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
        token = authHeader.slice(7).trim();
      } else if (req.query && typeof req.query.token === 'string') {
        token = req.query.token as string;
      }

      if (!ClientAuthManager.verifyToken(token)) {
        res.status(401).json({
          jsonrpc: '2.0',
          error: {
            code: -32001,
            message: 'Unauthorized: Invalid or missing Transgentic MCP client token. Include "Authorization: Bearer <token>" header or "?token=<token>" query parameter.',
          },
          id: null,
        });
        return;
      }
      next();
    });

    // OpenAI-compatible provider surface. This path deliberately bypasses the
    // MCP prompt/history pipeline: the caller owns its conversation and tools.
    this.app.get('/v1/models', (_req, res) => {
      const created = Math.floor(Date.now() / 1000);
      res.json({
        object: 'list',
        data: this.completionGateway.listModels().map(model => ({
          id: model.id,
          object: 'model',
          created,
          owned_by: 'transgentic',
          name: model.displayName,
        })),
      });
    });

    this.app.post('/v1/chat/completions', async (req, res) => {
      const controller = new AbortController();
      const abort = () => controller.abort();
      req.once('aborted', abort);
      res.once('close', () => { if (!res.writableEnded) abort(); });
      try {
        const remote = req.socket.remoteAddress || '';
        const result = await this.completionGateway.complete(req.body, controller.signal, { loopback: remote === '127.0.0.1' || remote === '::1' || remote === '::ffff:127.0.0.1' });
        const id = `chatcmpl-${crypto.randomUUID()}`;
        const created = Math.floor(Date.now() / 1000);
        if (req.body?.stream === true) {
          res.status(200);
          res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
          res.setHeader('Cache-Control', 'no-cache, no-transform');
          res.setHeader('Connection', 'keep-alive');
          const base = { id, object: 'chat.completion.chunk', created, model: req.body.model };
          const delta = { role: 'assistant', ...(result.message.content != null ? { content: result.message.content } : {}), ...(result.message.tool_calls ? { tool_calls: result.message.tool_calls.map((call, index) => ({ index, ...call })) } : {}) };
          res.write(`data: ${JSON.stringify({ ...base, choices: [{ index: 0, delta, finish_reason: null }] })}\n\n`);
          res.write(`data: ${JSON.stringify({ ...base, choices: [{ index: 0, delta: {}, finish_reason: result.finishReason }], ...(result.usage ? { usage: result.usage } : {}) })}\n\n`);
          res.end('data: [DONE]\n\n');
          return;
        }
        res.json({
          id, object: 'chat.completion', created, model: req.body.model,
          choices: [{ index: 0, message: result.message, finish_reason: result.finishReason }],
          ...(result.usage ? { usage: result.usage } : {}),
          transgentic: { provider: result.provider, providerModel: result.model },
        });
      } catch (error: any) {
        if (res.headersSent) { res.end(); return; }
        const message = controller.signal.aborted ? 'Completion request cancelled.' : error?.message || 'Completion request failed.';
        res.status(controller.signal.aborted ? 499 : 400).json({ error: { message, type: 'invalid_request_error', code: controller.signal.aborted ? 'request_cancelled' : 'completion_failed' } });
      } finally {
        req.removeListener('aborted', abort);
      }
    });

    // 1. Unified MCP Endpoint (Streamable HTTP + SSE)
    this.app.get('/mcp', (req, res) => {
      this.handleSseConnect(req, res, undefined, '/mcp');
    });
    this.app.post('/mcp', async (req, res) => {
      await this.handleClientMessage(req, res, undefined);
    });

    // Legacy SSE Endpoints (Backward Compatibility)
    this.app.get('/sse', (req, res) => {
      this.handleSseConnect(req, res, undefined, '/messages');
    });
    this.app.post('/sse', async (req, res) => {
      await this.handleClientMessage(req, res, undefined);
    });
    this.app.post('/messages', async (req, res) => {
      await this.handleClientMessage(req, res, undefined);
    });

    // 2. Direct Provider Gateways (e.g. /claude/mcp)
    const providers: ProviderId[] = ['chatgpt', 'claude', 'gemini', 'grok'];
    for (const p of providers) {
      this.app.get(`/${p}/mcp`, (req, res) => {
        this.handleSseConnect(req, res, p, `/${p}/mcp`);
      });
      this.app.post(`/${p}/mcp`, async (req, res) => {
        await this.handleClientMessage(req, res, p);
      });
      this.app.get(`/${p}/sse`, (req, res) => {
        this.handleSseConnect(req, res, p, `/${p}/messages`);
      });
      this.app.post(`/${p}/sse`, async (req, res) => {
        await this.handleClientMessage(req, res, p);
      });
      this.app.post(`/${p}/messages`, async (req, res) => {
        await this.handleClientMessage(req, res, p);
      });
    }

    // 3. Dedicated Mode Gateways (e.g. /image/sse, /video/sse, /music/sse, /coding/sse, /writing/sse)
    const modes: AcceptedTaskMode[] = ['image', 'video', 'music', 'coding', 'writing', 'general'];
    for (const m of modes) {
      this.app.get(`/${m}/mcp`, (req, res) => {
        this.handleSseConnect(req, res, undefined, `/${m}/mcp`, m);
      });
      this.app.post(`/${m}/mcp`, async (req, res) => {
        await this.handleClientMessage(req, res, undefined, m);
      });
      this.app.get(`/${m}/sse`, (req, res) => {
        this.handleSseConnect(req, res, undefined, `/${m}/messages`, m);
      });
      this.app.post(`/${m}/sse`, async (req, res) => {
        await this.handleClientMessage(req, res, undefined, m);
      });
      this.app.post(`/${m}/messages`, async (req, res) => {
        await this.handleClientMessage(req, res, undefined, m);
      });
    }
  }

  private handleSseConnect(
    req: Request,
    res: Response,
    targetProvider?: ProviderId,
    messageEndpoint: string = '/messages',
    defaultMode?: AcceptedTaskMode
  ): void {
    const sessionId = crypto.randomUUID();
    const requestedProfile = parseResponseProfile(req.query?.response_profile);
    if (requestedProfile) this.clientProfiles.set(sessionId, { profile: requestedProfile, lastUsed: Date.now() });
    let token: string | undefined;
    const authHeader = req.headers['authorization'];
    if (authHeader && typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
      token = authHeader.slice(7).trim();
    } else if (req.query && typeof req.query.token === 'string') {
      token = req.query.token as string;
    }

    const queryProvider = req.query.provider as string | undefined;
    const effectiveProvider: ProviderId | undefined = targetProvider || (queryProvider as ProviderId) || undefined;

    const rawMode = (req.query.mode as string | undefined) || defaultMode;
    let effectiveMode: AcceptedTaskMode | undefined = undefined;
    if (rawMode && ['general', 'coding', 'writing', 'image', 'video', 'music'].includes(rawMode)) {
      effectiveMode = rawMode as AcceptedTaskMode;
    }

    SseTransportManager.registerClient(sessionId, res, effectiveProvider, messageEndpoint, undefined, token, effectiveMode);

    req.on('close', () => {
      SseTransportManager.removeClient(sessionId);
    });
  }

  private async processSingleJsonRpcMessage(
    body: any,
    req: Request,
    sseClient: any,
    directProvider?: ProviderId,
    sessionId: string = '',
    defaultMode?: AcceptedTaskMode,
    progressSink?: (message: any) => void
  ): Promise<any> {
    if (!body || typeof body !== 'object') {
      return { jsonrpc: '2.0', error: { code: -32700, message: 'Parse error' }, id: null };
    }

    const { jsonrpc, method, params, id } = body;
    const isNotification = id === undefined || id === null;
    let reqContext;
    try {
      reqContext = BaseMcpHandler.createContext(req, sessionId, id ?? crypto.randomUUID());
    } catch {
      return { jsonrpc: '2.0', id, error: { code: -32600, message: 'Request ID is already active in this session.' } };
    }
    const storedProfile = this.clientProfiles.get(sessionId);
    if (storedProfile) storedProfile.lastUsed = Date.now();
    const profile = parseResponseProfile(params?.arguments?.response_profile)
      || parseResponseProfile(req.query?.response_profile)
      || storedProfile?.profile
      || 'agentic'; // Preserve clients that predate initialization/profile support.
    let progress = 0;
    let lastProgress = '';
    const progressToken = params?._meta?.progressToken;
    const remote = req.socket.remoteAddress || '';
    const caller: CallerContext = { profile, sessionId, isLoopback: remote === '127.0.0.1' || remote === '::1' || remote === '::ffff:127.0.0.1' };
    if (progressSink && (typeof progressToken === 'string' || typeof progressToken === 'number')) {
      caller.reportProgress = (message) => {
        if (message === lastProgress || reqContext.abortController.signal.aborted || !BaseMcpHandler.getContext(reqContext.requestId, sessionId)) return;
        lastProgress = message;
        try { progressSink({ jsonrpc: '2.0', method: 'notifications/progress', params: { progressToken, progress: ++progress, message } }); } catch {}
      };
    }

    try {
      // Handle MCP Notifications
      if (method === 'notifications/initialized' || method === 'initialized' || method === 'notifications/cancelled' || method === 'cancelled') {
        if (method === 'notifications/cancelled' || method === 'cancelled') {
          const targetReqId = params?.requestId;
          if (typeof targetReqId === 'string' || typeof targetReqId === 'number') {
            const ctx = BaseMcpHandler.getContext(targetReqId, sessionId);
            if (ctx && !ctx.abortController.signal.aborted) {
              ctx.abortController.abort();
            }
          }
        }
        return null;
      }

      if (method && typeof method === 'string' && method.startsWith('notifications/')) {
        return null;
      }

      // Handle MCP methods
      if (method === 'initialize') {
        this.clientProfiles.set(sessionId, {
          profile: parseResponseProfile(params?._meta?.['transgentic/responseProfile'])
            || parseResponseProfile(req.query?.response_profile)
            || inferResponseProfile(params?.clientInfo?.name),
          lastUsed: Date.now(),
        });
        return {
          jsonrpc: '2.0',
          id,
          result: {
            protocolVersion: params?.protocolVersion || '2024-11-05',
            serverInfo: {
              name: 'transgentic-mcp-server',
              version: '1.0.0',
            },
            capabilities: {
              tools: { listChanged: false },
              prompts: { listChanged: false },
              resources: { subscribe: false, listChanged: false },
            },
          },
        };
      } else if (method === 'tools/list') {
        return {
          jsonrpc: '2.0',
          id,
          result: {
            tools: this.getToolDefinitions(),
          },
        };
      } else if (method === 'tools/call') {
        const toolName = params?.name;
        const args = params?.arguments || {};
        const providerToUse = directProvider || sseClient?.targetProvider;
        const modeToUse = defaultMode || sseClient?.targetMode;
        try {
          caller.reportProgress?.('Request accepted');
          const callResult = await this.executeMcpTool(toolName, args, providerToUse, reqContext.abortController.signal, modeToUse, caller);
          if (reqContext.abortController.signal.aborted) return null;
          caller.reportProgress?.(callResult.isError ? 'Request failed' : 'Request completed');
          return {
            jsonrpc: '2.0',
            id,
            result: callResult,
          };
        } catch (toolErr: any) {
          if (reqContext.abortController.signal.aborted) return null;
          // MCP Specification: Tool execution errors should be returned in ToolResult with isError: true
          const fallbackDirective = profile === 'agentic'
            ? '\n\n[FALLBACK FOR AGENTIC CLIENT]: This provider request failed. Continue only within the user\'s requested scope; use another approach when appropriate.' : '';
          return {
            jsonrpc: '2.0',
            id,
            result: {
              content: [
                {
                  type: 'text',
                  text: `[Transgentic Error] ${toolErr.message || 'Error executing tool'}${fallbackDirective}`,
                },
              ],
              isError: true,
              structuredContent: { status: 'failed', answer: toolErr.message || 'Error executing tool', responseProfile: profile },
            },
          };
        }
      } else if (method === 'prompts/list') {
        return {
          jsonrpc: '2.0',
          id,
          result: {
            prompts: [
              {
                name: 'code_review',
                description: 'Runs a high-density architectural & security review with automated secret blinding.',
                arguments: [
                  { name: 'code', description: 'The source code to review', required: true },
                ],
              },
              {
                name: 'refactor_clean_code',
                description: 'Refactors code for maintainability, idiomatic patterns, and performance.',
                arguments: [
                  { name: 'code', description: 'The source code to refactor', required: true },
                ],
              },
            ],
          },
        };
      } else if (method === 'prompts/get') {
        const promptName = params?.name;
        const args = params?.arguments || {};
        if (promptName === 'code_review') {
          return {
            jsonrpc: '2.0',
            id,
            result: {
              description: 'Code Review Prompt',
              messages: [
                {
                  role: 'user',
                  content: {
                    type: 'text',
                    text: `Please review the following code for security vulnerabilities, edge cases, and architectural clarity:\n\n${args.code || ''}`,
                  },
                },
              ],
            },
          };
        } else {
          return {
            jsonrpc: '2.0',
            id,
            result: {
              description: 'Refactor Prompt',
              messages: [
                {
                  role: 'user',
                  content: {
                    type: 'text',
                    text: `Please refactor this code to follow clean architecture principles:\n\n${args.code || ''}`,
                  },
                },
              ],
            },
          };
        }
      } else if (method === 'resources/list') {
        return {
          jsonrpc: '2.0',
          id,
          result: {
            resources: [
              {
                uri: 'transgentic://logs',
                name: 'Transgentic MCP Request Logs',
                mimeType: 'application/json',
              },
              {
                uri: 'transgentic://vault',
                name: 'Active Data Blinding In-Memory Vault Inventory',
                mimeType: 'application/json',
              },
              {
                uri: 'transgentic://status',
                name: 'Transgentic System Health & Provider Metrics',
                mimeType: 'application/json',
              },
              {
                uri: 'transgentic://models',
                name: 'Transgentic Active Model Registry State',
                mimeType: 'application/json',
              },
            ],
          },
        };
      } else if (method === 'resources/read') {
        const uri = params?.uri;
        let contentText = '';
        if (uri === 'transgentic://logs') {
          contentText = JSON.stringify(this.requestLogs, null, 2);
        } else if (uri === 'transgentic://vault') {
          contentText = JSON.stringify(globalBlindingEngine.getTokens(), null, 2);
        } else if (uri === 'transgentic://models') {
          contentText = JSON.stringify(ModelRegistryManager.getRegistry(), null, 2);
        } else {
          contentText = JSON.stringify(
            {
              core: this.getCoreStatus(),
              providers: { ...globalSessionManager.getAllStatuses(), ...globalCliRuntime.getStatuses() },
              routes: DynamicRouter.getAllRouteConfigs(),
            },
            null,
            2
          );
        }
        return {
          jsonrpc: '2.0',
          id,
          result: {
            contents: [
              {
                uri,
                mimeType: 'application/json',
                text: contentText,
              },
            ],
          },
        };
      } else if (method === 'roots/list') {
        return { jsonrpc: '2.0', id, result: { roots: [] } };
      } else if (method === 'ping') {
        return { jsonrpc: '2.0', id, result: {} };
      } else {
        if (!isNotification) {
          return {
            jsonrpc: '2.0',
            id,
            error: { code: -32601, message: `Method not found: ${method}` },
          };
        }
        return null;
      }
    } catch (err: any) {
      if (!isNotification) {
        return {
          jsonrpc: '2.0',
          id,
          error: { code: -32603, message: err.message || 'Internal error' },
        };
      }
      return null;
    } finally {
      BaseMcpHandler.cleanupContext(reqContext.requestId, sessionId);
    }
  }

  private async handleClientMessage(req: Request, res: Response, directProvider?: ProviderId, defaultMode?: AcceptedTaskMode): Promise<void> {
    const sessionId = (req.query.sessionId as string) || (req.headers['mcp-session-id'] as string) || crypto.randomUUID();
    for (const [key, value] of this.clientProfiles) {
      if (Date.now() - value.lastUsed > 24 * 60 * 60 * 1000 && !SseTransportManager.getClient(key)) this.clientProfiles.delete(key);
    }
    const sseClient = sessionId ? SseTransportManager.getClient(sessionId) : undefined;
    const body = req.body;

    const queryMode = (req.query.mode as string | undefined) || defaultMode || sseClient?.targetMode;
    let resolvedMode: AcceptedTaskMode | undefined = undefined;
    if (queryMode && ['general', 'coding', 'writing', 'image', 'video', 'music'].includes(queryMode)) {
      resolvedMode = queryMode as AcceptedTaskMode;
    }

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('mcp-session-id', sessionId);

    if (!body) {
      res.status(400).json({ jsonrpc: '2.0', error: { code: -32700, message: 'Parse error: empty request body' }, id: null });
      return;
    }

    // If using SSE transport, acknowledge message receipt immediately with 202 Accepted
    if (sseClient) {
      res.status(202).json({ status: 'accepted' });
    }
    const wantsProgress = !sseClient && !Array.isArray(body) && body.method === 'tools/call'
      && (typeof body.params?._meta?.progressToken === 'string' || typeof body.params?._meta?.progressToken === 'number')
      && req.accepts('text/event-stream') && String(req.headers.accept || '').includes('text/event-stream');
    if (wantsProgress) {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.flushHeaders();
    }
    const progressSink = sseClient
      ? (message: any) => { SseTransportManager.sendMessage(sessionId, message); }
      : wantsProgress ? (message: any) => { if (!res.writableEnded) res.write(`event: message\ndata: ${JSON.stringify(message)}\n\n`); } : undefined;

    if (Array.isArray(body)) {
      const results = await Promise.all(
        body.map((item) => this.processSingleJsonRpcMessage(item, req, sseClient, directProvider, sessionId, resolvedMode, progressSink))
      );
      const responses = results.filter((r) => r !== null);
      if (sseClient) {
        for (const resp of responses) {
          SseTransportManager.sendMessage(sessionId, resp);
        }
      } else if (!res.headersSent) {
        if (responses.length > 0) {
          res.status(200).json(responses);
        } else {
          res.removeHeader('Content-Type');
          res.status(202).end();
        }
      }
      return;
    }

    const responseData = await this.processSingleJsonRpcMessage(body, req, sseClient, directProvider, sessionId, resolvedMode, progressSink);
    if (wantsProgress) {
      if (responseData) progressSink?.(responseData);
      res.end();
      return;
    }

    if (responseData) {
      if (sseClient) {
        SseTransportManager.sendMessage(sessionId, responseData);
      } else if (!res.headersSent) {
        res.status(200).json(responseData);
      }
    } else if (!sseClient && !res.headersSent) {
      // Streamable HTTP notifications do not have a JSON-RPC response body.
      // Acknowledge receipt without advertising an empty JSON document so
      // clients such as Codex do not treat the transport as malformed.
      res.removeHeader('Content-Type');
      res.status(202).end();
    }
  }

  private providerAttachmentKinds(providerId: ProviderId, mode: TaskMode, requestedModel?: string): AttachmentKind[] {
    if (providerId === 'localllm') return [...(this.config?.localLLM?.attachmentKinds || [])];
    if (isCliProvider(providerId)) {
      if (providerId === 'cli_codex' || providerId === 'cli_claude_code' || providerId === 'cli_antigravity' || providerId === 'cli_grok') return ['image', 'document'];
      return [];
    }
    const service = ServiceManifestManager.getManifest().services[providerId];
    if (service?.providerType === 'api' || providerId.startsWith('api_')) {
      const model = requestedModel ? service?.models?.find(item => item.id === requestedModel) : undefined;
      return [...(model?.attachmentKinds || service?.attachmentKinds || [])];
    }
    const adapter: any = globalSessionManager.getAdapter(providerId);
    const modeKey = mode === 'general' || mode === 'writing' || mode === 'coding' ? 'text' : mode;
    return [...(adapter?.recipe?.response?.modes?.[modeKey]?.inputAttachments?.acceptedKinds || [])];
  }

  private filterAttachmentCapableProviders(providers: ProviderId[], files: readonly StagedAttachment[], mode: TaskMode, requestedModel?: string, forcedProvider?: ProviderId): ProviderId[] {
    if (!files.length) return providers;
    const required = new Set(files.map(file => file.kind));
    const capable = providers.filter(provider => {
      const kinds = new Set(this.providerAttachmentKinds(provider, mode, requestedModel));
      return [...required].every(kind => kinds.has(kind));
    });
    if (forcedProvider && capable.length === 0) {
      throw new Error(`Provider "${forcedProvider}" does not declare support for all attached ${[...required].join('/')} inputs in ${mode} mode.`);
    }
    return capable;
  }

  private getToolDefinitions() {
    const chatgptModels = ModelRegistryManager.getUsableModels('chatgpt').map((m) => m.id);
    const claudeModels = ModelRegistryManager.getUsableModels('claude').map((m) => m.id);
    const geminiModels = ModelRegistryManager.getUsableModels('gemini').map((m) => m.id);
    const grokModels = ModelRegistryManager.getUsableModels('grok').map((m) => m.id);

    const sessionProperties = {
      workspace_id: { type: 'string', description: 'Locally registered CLI workspace ID. Requires a local MCP grant. Omit for answer-only requests.' },
      allow_project_editing: { type: 'boolean', description: 'May restrict an existing local editing grant; cannot grant additional access.' },
      allow_commands: { type: 'boolean', description: 'May restrict an existing local command grant; cannot grant additional access.' },
      response_profile: { type: 'string', enum: ['agentic', 'plain'], description: 'Response style override: agentic adds workflow guidance; plain returns neutral answers. Defaults to the connection profile.' },
      thread_id: { type: 'string', description: 'Unique identifier for conversation continuity. Reuses existing web chat if matched.' },
      threadId: { type: 'string', description: 'Alias for thread_id.' },
      new_thread: { type: 'boolean', default: false, description: 'If true, forces creation of a brand new chat thread.' },
      newThread: { type: 'boolean', default: false, description: 'Alias for new_thread.' },
      project_name: { type: 'string', description: 'Optional workspace/project grouping name.' },
      projectName: { type: 'string', description: 'Alias for project_name.' },
    };

    const modeProperty = {
      type: 'string',
      enum: ['general', 'coding', 'writing', 'image', 'video', 'music'],
      description: 'Optional task mode hint affecting routing and output structure. Writing is a backend mode with prose guidance that uses the General route configuration.',
    };

    const filesProperty = {
      type: 'array',
      maxItems: 10,
      description: 'Request-scoped attachments. Each item must contain exactly one source: path (authenticated loopback clients only), raw base64 data, or a public HTTPS/data URL.',
      items: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Absolute readable host path; loopback clients only.' },
          data: { type: 'string', description: 'Raw base64 bytes. Requires name and mimeType.' },
          url: { type: 'string', description: 'A public HTTPS URL or base64 data: URL.' },
          name: { type: 'string' },
          mimeType: { type: 'string' },
        },
        oneOf: [
          { required: ['path'], not: { anyOf: [{ required: ['data'] }, { required: ['url'] }] } },
          { required: ['data', 'name', 'mimeType'], not: { anyOf: [{ required: ['path'] }, { required: ['url'] }] } },
          { required: ['url'], not: { anyOf: [{ required: ['path'] }, { required: ['data'] }] } },
        ],
        additionalProperties: false,
      },
    };

    return [
      ...CLI_IDS.map(id => ({ name: ({ cli_codex: 'ask_codex_cli', cli_claude_code: 'ask_claude_code_cli', cli_antigravity: 'ask_antigravity_cli', cli_grok: 'ask_grok_cli' })[id], description: `Query the configured ${CLI_DEFINITIONS[id].name}. Editing and commands require local grants.`, inputSchema: { type: 'object', properties: { prompt: { type: 'string' }, mode: { type: 'string', enum: ['general', 'coding', 'writing'] }, model: { type: 'string' }, files: filesProperty, ...sessionProperties }, required: ['prompt'] } })),
      {
        name: 'prompt_model',
        description:
          'RECOMMENDED DEFAULT: Primary Transgentic auto-routing endpoint. Automatically classifies task intent (general, coding, writing, reasoning, image, video, music) and routes to the optimal active provider (Claude, ChatGPT, Gemini, Grok) with data blinding, secret protection, rate-limit fallback, model selection, and thread continuity. For media generation (images, storyboard scenes, video, music), specify the "mode" parameter ("image", "video", "music") or use dedicated media tools (generate_image, generate_video, generate_music) so Transgentic switches to specialized models rather than general text LLMs.',
        inputSchema: {
          type: 'object',
          properties: {
            prompt: { type: 'string', description: 'The prompt or instruction to execute.' },
            mode: {
              type: 'string',
              enum: ['general', 'coding', 'writing', 'image', 'video', 'music'],
              description: 'Optional task mode hint affecting model routing & output structuring. If omitted, automatically classified.',
            },
            provider: {
              type: 'string',
              description: 'Optional forced provider or configured custom API/webview service ID. If omitted, uses intelligent auto-routing.',
            },
            model: {
              type: 'string',
              description: 'Optional target model ID (e.g. gpt-4o, claude-3-5-sonnet, o1, grok-3). If allowMcpOverride is enabled, switches model in Webview.',
            },
            files: filesProperty,
            ...sessionProperties,
          },
          required: ['prompt'],
        },
      },
      {
        name: 'ask_chatgpt',
        description:
          'Directly queries ChatGPT (OpenAI). Use ONLY when the user explicitly names ChatGPT or OpenAI in their request. For general questions without a specific provider request, use prompt_model instead for automatic optimal routing.',
        inputSchema: {
          type: 'object',
          properties: {
            prompt: { type: 'string', description: 'Prompt to send to ChatGPT.' },
            mode: modeProperty,
            model: chatgptModels.length > 0 ? { type: 'string', enum: chatgptModels, description: 'Target ChatGPT model.' } : { type: 'string' },
            files: filesProperty,
            ...sessionProperties,
          },
          required: ['prompt'],
        },
      },
      {
        name: 'ask_claude',
        description:
          'Directly queries Claude (Anthropic). Use ONLY when the user explicitly names Claude or Anthropic in their request. For general questions without a specific provider request, use prompt_model instead for automatic optimal routing.',
        inputSchema: {
          type: 'object',
          properties: {
            prompt: { type: 'string', description: 'Prompt to send to Claude.' },
            mode: modeProperty,
            model: claudeModels.length > 0 ? { type: 'string', enum: claudeModels, description: 'Target Claude model.' } : { type: 'string' },
            files: filesProperty,
            ...sessionProperties,
          },
          required: ['prompt'],
        },
      },
      {
        name: 'ask_gemini',
        description:
          'Directly queries Gemini (Google). Use ONLY when the user explicitly names Gemini or Google in their request. For general questions without a specific provider request, use prompt_model instead for automatic optimal routing.',
        inputSchema: {
          type: 'object',
          properties: {
            prompt: { type: 'string', description: 'Prompt to send to Gemini.' },
            mode: modeProperty,
            model: geminiModels.length > 0 ? { type: 'string', enum: geminiModels, description: 'Target Gemini model.' } : { type: 'string' },
            files: filesProperty,
            ...sessionProperties,
          },
          required: ['prompt'],
        },
      },
      {
        name: 'ask_grok',
        description:
          'Directly queries Grok (xAI). Use ONLY when the user explicitly names Grok or xAI in their request. For general questions without a specific provider request, use prompt_model instead for automatic optimal routing.',
        inputSchema: {
          type: 'object',
          properties: {
            prompt: { type: 'string', description: 'Prompt to send to Grok.' },
            mode: modeProperty,
            model: grokModels.length > 0 ? { type: 'string', enum: grokModels, description: 'Target Grok model.' } : { type: 'string' },
            files: filesProperty,
            ...sessionProperties,
          },
          required: ['prompt'],
        },
      },
      {
        name: 'generate_image',
        description:
          'Generates an image via Grok (Imagine), ChatGPT (DALL-E), or Gemini (Imagen), downloads it locally to disk, and returns the short local file path. Recommended for storyboarding, scene illustrations, and visual concept generation. Automatically activates image mode and switches to the optimal image model.',
        inputSchema: {
          type: 'object',
          properties: {
            prompt: { type: 'string', description: 'Image generation prompt.' },
            provider: {
              type: 'string',
              enum: ['grok', 'chatgpt', 'gemini'],
              description: 'Optional provider override. If omitted, uses intelligent image routing (Grok -> ChatGPT -> Gemini).',
            },
            model: {
              type: 'string',
              description: 'Optional target model ID (e.g. dall-e-3).',
            },
            ...sessionProperties,
          },
          required: ['prompt'],
        },
      },
      {
        name: 'generate_video',
        description:
          'Generates a video via Grok or Gemini, downloads to local assets, and returns the short file path. Recommended for storyboard scenes and dynamic animations. Automatically activates video mode.',
        inputSchema: {
          type: 'object',
          properties: {
            prompt: { type: 'string', description: 'Video generation prompt.' },
            provider: {
              type: 'string',
              enum: ['grok', 'gemini'],
              description: 'Optional provider override.',
            },
            model: {
              type: 'string',
              description: 'Optional target model ID.',
            },
            ...sessionProperties,
          },
          required: ['prompt'],
        },
      },
      {
        name: 'edit_image',
        description: 'Edits or transforms one or more attached images using Image mode. At least one image attachment is required.',
        inputSchema: {
          type: 'object',
          properties: {
            prompt: { type: 'string', description: 'Image editing instructions.' },
            files: filesProperty,
            provider: { type: 'string', description: 'Optional provider or configured service ID.' },
            model: { type: 'string' },
            ...sessionProperties,
          },
          required: ['prompt', 'files'],
        },
      },
      {
        name: 'edit_video',
        description: 'Edits or transforms attached image/video media using Video mode. At least one image or video attachment is required.',
        inputSchema: {
          type: 'object',
          properties: {
            prompt: { type: 'string', description: 'Video editing instructions.' },
            files: filesProperty,
            provider: { type: 'string', description: 'Optional provider or configured service ID.' },
            model: { type: 'string' },
            ...sessionProperties,
          },
          required: ['prompt', 'files'],
        },
      },
      {
        name: 'generate_music',
        description:
          'Generates songs, background music, soundtracks, beats, melodies, jingles, and instrumentals via Gemini, saves the result locally, and returns the short file path. Automatically activates Music mode.',
        inputSchema: {
          type: 'object',
          properties: {
            prompt: { type: 'string', description: 'Music generation prompt.' },
            provider: {
              type: 'string',
              enum: ['gemini'],
              description: 'Optional provider override.',
            },
            model: {
              type: 'string',
              description: 'Optional target model ID.',
            },
            ...sessionProperties,
          },
          required: ['prompt'],
        },
      },
      {
        name: 'get_status',
        description:
          'Diagnostic tool only. Returns health, authenticated providers, current rate limits, and model registry. Use ONLY when the user explicitly requests system health or diagnostics. NEVER call this tool prior to running prompt_model.',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
    ];
  }

  private async executeMcpTool(
    name: string,
    args: any,
    directProvider?: ProviderId,
    abortSignal?: AbortSignal,
    defaultMode?: AcceptedTaskMode,
    caller?: CallerContext
  ): Promise<any> {
    if (name === 'get_status') {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                core: this.getCoreStatus(),
                providers: { ...globalSessionManager.getAllStatuses(), ...globalCliRuntime.getStatuses() },
                models: ModelRegistryManager.getRegistry(),
              },
              null,
              2
            ),
          },
        ],
      };
    }

    const prompt = args.prompt;
    if (!prompt || typeof prompt !== 'string') {
      throw new Error(`Missing required 'prompt' argument for tool ${name}`);
    }

    const projectName = args.project_name || args.projectName;
    const threadId = args.thread_id || args.threadId;
    const newThread = Boolean(args.new_thread ?? args.newThread ?? false);

    let mode: AcceptedTaskMode = defaultMode || 'general';
    let provider: ProviderId | undefined = directProvider || args.provider;
    const requestedModel: string | undefined = args.model;
    let isStrictExplicitMode = Boolean(defaultMode);

    if (name === 'ask_chatgpt') provider = 'chatgpt';
    if (name === 'ask_claude') provider = 'claude';
    if (name === 'ask_gemini') provider = 'gemini';
    if (name === 'ask_grok') provider = 'grok';
    const cliTools: Record<string, string> = { ask_codex_cli: 'cli_codex', ask_claude_code_cli: 'cli_claude_code', ask_antigravity_cli: 'cli_antigravity', ask_grok_cli: 'cli_grok' };
    if (cliTools[name]) provider = cliTools[name];
    if (args.workspace_id !== undefined || args.allow_project_editing !== undefined || args.allow_commands !== undefined) {
      if (args.workspace_id !== undefined && typeof args.workspace_id !== 'string') throw new Error('workspace_id must be a registered workspace ID.');
      for (const key of ['allow_project_editing', 'allow_commands']) if (args[key] !== undefined && typeof args[key] !== 'boolean') throw new Error(`${key} must be a boolean.`);
      caller = { profile: caller?.profile || 'agentic', sessionId: caller?.sessionId || 'legacy', ...caller, cliRequest: { workspaceId: args.workspace_id, allowProjectEditing: args.allow_project_editing, allowCommands: args.allow_commands } };
    }

    if (name === 'generate_image') {
      if (args.files !== undefined) throw new Error('generate_image is text-only. Use edit_image to provide source images.');
      mode = 'image';
      isStrictExplicitMode = true;
    }
    if (name === 'generate_video') {
      if (args.files !== undefined) throw new Error('generate_video is text-only. Use edit_video to provide source media.');
      mode = 'video';
      isStrictExplicitMode = true;
    }
    if (name === 'generate_music') {
      if (args.files !== undefined) throw new Error('generate_music does not accept attachments.');
      mode = 'music';
      isStrictExplicitMode = true;
    }
    if (args.mode && ['general', 'coding', 'writing', 'image', 'video', 'music'].includes(args.mode)) {
      mode = args.mode;
      isStrictExplicitMode = true;
    }

    let attachmentRequirement: 'image-only' | 'image-or-video' | undefined;
    if (name === 'edit_image') { mode = 'image'; isStrictExplicitMode = true; attachmentRequirement = 'image-only'; }
    if (name === 'edit_video') { mode = 'video'; isStrictExplicitMode = true; attachmentRequirement = 'image-or-video'; }
    if (attachmentRequirement && (!Array.isArray(args.files) || args.files.length === 0)) throw new Error(`${name} requires at least one attachment.`);

    return await this.orchestratePrompt(prompt, mode, provider, projectName, requestedModel, abortSignal, threadId, newThread, undefined, isStrictExplicitMode, caller, args.files, attachmentRequirement);
  }

  private async executePipelineCandidateChain(params: {
    candidateProviders: ProviderId[];
    effectiveMode: TaskMode;
    taskIntent?: TaskIntent;
    maskedText: string;
    contextId: string;
    projectName?: string;
    requestedModel?: string;
    abortSignal?: AbortSignal;
    effectiveThreadId: string;
    newThread?: boolean;
    isQuickPrompt?: boolean;
    isBalanced: boolean;
    microTask: any;
    reqAbortController?: AbortController | null;
    isAgenticClient: boolean;
    pipeline: 'main' | 'co';
    reqId: string;
    startTime: number;
    bypassedWebviewDispatch?: boolean;
    forcedProvider?: ProviderId;
    reportProgress?: (message: string) => void;
    isolateConversation?: boolean;
    cliRequest?: CliRequestOptions;
    requestEnvelope?: NormalizedRequestEnvelope;
  }): Promise<{
    text: string;
    finalResponseWithLocalPath: string;
    mediaPath?: string;
    provider: ProviderId;
    modelUsed?: string;
    account: any;
    wasNewChat: boolean;
    wasRolledOver: boolean;
  }> {
    const {
      candidateProviders,
      effectiveMode,
      taskIntent,
      maskedText,
      projectName,
      requestedModel,
      abortSignal,
      effectiveThreadId,
      newThread,
      isBalanced,
      microTask,
      reqAbortController,
      isAgenticClient,
      pipeline,
      reqId,
      bypassedWebviewDispatch,
      forcedProvider,
      reportProgress,
      isolateConversation,
    } = params;
    const attachments = params.requestEnvelope?.attachments.files || [];
    const attachmentIdentity = params.requestEnvelope?.attachments.identity || '';

    const activeLocalLlmConfig = this.config?.localLLM || DynamicRouter.getLocalLlmConfig();
    const isLocalMicroTaskEnabled = Boolean(activeLocalLlmConfig?.localMicroTask);

    let executionResult: any = null;
    let successfulProvider: ProviderId | null = null;
    let successfulAccount: any = null;
    let lastCandidateError: any = null;
    let wasRolledOver = false;
    let wasNewChat = false;

    for (let i = 0; i < candidateProviders.length; i++) {
      const providerId = candidateProviders[i];
      throwIfCancelled(reqAbortController?.signal || abortSignal);
      reportProgress?.(`Routing to ${getProviderDisplayName(providerId)}`);

      if (isCliProvider(providerId)) {
        const cliService = globalCliRuntime.getServiceConfig(providerId);
        const routeWorkspace = cliService.workMode === 'agentic'
          ? DynamicRouter.getRule(effectiveMode, pipeline).cliWorkspaces?.[providerId]
          : undefined;
        const cliRequest = { ...params.cliRequest, workspaceId: params.cliRequest?.workspaceId ?? routeWorkspace };
        try {
          if (!cliSupportsMode(effectiveMode)) throw new Error('CLI services support General, Writing, and Coding modes. Writing uses the General route configuration.');
          const cfg = ModelRegistryManager.getProviderConfig(providerId);
          if (!ServiceManifestManager.isServiceEnabled(providerId) || cfg?.serviceEnabled === false) throw new Error('CLI service is disabled. Enable it in Settings.');
          if (globalRateLimiter.isRateLimited(providerId)) throw new Error('[RATE_LIMIT] CLI service is cooling down.');
          const scopedThreadId = JSON.stringify([effectiveThreadId, providerId, 'native', cliRequest.workspaceId || null]);
          const rollover = !newThread && globalThreadManager.shouldRollover(scopedThreadId, providerId, 10, 30000);
          const fresh = Boolean(newThread || rollover || !globalThreadManager.getSession(scopedThreadId, providerId));
          let prompt = maskedText;
          if (fresh && this.config?.recall && isRecallEnabledForMode(this.config, effectiveMode)) {
            prompt = 'Use only the supplied context and this scoped CLI conversation. Do not claim access to web chat memory.\n\n' + prompt;
          }
          if (rollover) {
            const history = globalThreadManager.getHistory(scopedThreadId, providerId).slice(-4).map(m => `${m.role}: ${m.content}`).join('\n').slice(-8000);
            prompt = `Prior scoped conversation (bounded, possibly incomplete):\n${history}\n\nCurrent request:\n${prompt}`;
          }
          if (effectiveMode === 'coding' && activeLocalLlmConfig?.enabled && activeLocalLlmConfig.localZeroLeak) prompt = globalLocalZeroLeakManager.sanitizePrompt(prompt, reqId).sanitizedText;
          if (effectiveMode === 'coding' && activeLocalLlmConfig?.enabled && activeLocalLlmConfig.localCompact) prompt = (await globalLocalCompactManager.compactPrompt(prompt, activeLocalLlmConfig, reqAbortController?.signal || abortSignal)).compactedText;
          const explicitModel = cfg?.allowMcpOverride === false ? undefined : requestedModel;
          const model = explicitModel || DynamicRouter.resolveTargetModel(providerId, effectiveMode, undefined, pipeline) || undefined;
          reportProgress?.(`Queued for ${CLI_DEFINITIONS[providerId].name}`);
          this.updateCoreState('processing', providerId, `Processing on ${CLI_DEFINITIONS[providerId].name}`);
          executionResult = await globalCliRuntime.execute(providerId, prompt, { reqId, conversationKey: scopedThreadId, newThread: fresh,
            model, signal: reqAbortController?.signal || abortSignal, progress: reportProgress, request: cliRequest, desktop: params.isQuickPrompt, reviewer: pipeline === 'co', attachments,
            beforeStart: async signal => {
              await globalRateLimiter.applyCliCooldown(providerId, signal);
              if (globalRateLimiter.isRateLimited(providerId)) throw new Error('[RATE_LIMIT] CLI service is cooling down.');
              globalRateLimiter.recordRequest(providerId);
            } });
          if (fresh) globalThreadManager.removeSession(scopedThreadId, providerId);
          globalThreadManager.setSession(scopedThreadId, providerId, '', projectName);
          globalThreadManager.recordTurn(scopedThreadId, providerId, maskedText, executionResult.text);
          globalThreadManager.markPresetPromptsSent(scopedThreadId, providerId);
          successfulProvider = providerId; successfulAccount = globalCliRuntime.identity(providerId);
          wasNewChat = fresh || executionResult.wasNewChat; wasRolledOver = Boolean(rollover);
          globalRateLimiter.markSuccess(providerId);
          break;
        } catch (error) {
          throwIfCancelled(reqAbortController?.signal || abortSignal);
          const err = error as Error & { noFallback?: boolean; providerUsed?: string };
          err.providerUsed = providerId; lastCandidateError = err;
          if (forcedProvider || err.noFallback || cliRequest.workspaceId) throw err;
          continue;
        }
      }

      // Dedicated execution for Local LLM
      if (providerId === 'localllm') {
        const localLlmConfig = this.config?.localLLM || DynamicRouter.getLocalLlmConfig();
        if (!localLlmConfig?.enabled) {
          console.warn(`[Transgentic] Local LLM is disabled in settings. Skipping to next candidate in fallback chain.`);
          lastCandidateError = new Error(`Local LLM is configured as route candidate but is disabled in settings.`);
          continue;
        }

        // Classification guides routing and prompt specialization, never replaces an
        // explicitly routed request with client instructions. Append guidance after completion.

        this.updateCoreState('routing', 'localllm', `Routing to Local LLM (${localLlmConfig.preset})...`);

        const scopedThreadId = `${effectiveThreadId}_localllm`;
        if (newThread) {
          globalThreadManager.removeSession(scopedThreadId, 'localllm');
        }

        const existingSession = globalThreadManager.getSession(scopedThreadId, 'localllm');
        const isTooLong = !newThread && existingSession && globalThreadManager.shouldRollover(scopedThreadId, 'localllm', 10, 30000);
        if (isTooLong) {
          wasRolledOver = true;
          globalThreadManager.removeSession(scopedThreadId, 'localllm');
        }

        const presetsAlreadySent = globalThreadManager.hasPresetPromptsBeenSent(scopedThreadId, 'localllm');
        const isLocalNewChat = Boolean(newThread || isTooLong || !existingSession || !presetsAlreadySent);

        try {
          const modelName = localLlmConfig.selectedModel || `local-${localLlmConfig.preset}`;
          this.updateCoreState('processing', 'localllm', `Processing on Local LLM (${modelName})...`);

          let llmPrompt = maskedText;
          if (isLocalNewChat) {
            if (isAgenticClient && (isBalanced || (effectiveMode === 'coding' && isLocalMicroTaskEnabled && microTask.isMicroTask))) {
              llmPrompt = microTask.isMicroTask
                ? wrapBalancedLocalLlmPrompt(llmPrompt, microTask.category)
                : wrapBalancedAgenticPrompt(llmPrompt, taskIntent || effectiveMode);
            } else if (isAgenticClient) {
              llmPrompt = wrapUnbalancedAgenticPrompt(llmPrompt, taskIntent || effectiveMode);
            }
            if (this.config?.recall) {
              llmPrompt = applyRecallPipeline(llmPrompt, this.config.recall, effectiveMode);
            }
          }

          const previousHistory = (!newThread && !isTooLong) ? globalThreadManager.getHistory(scopedThreadId, 'localllm') : [];
          const chatMessages = [
            ...previousHistory.map((h) => ({ role: h.role, content: h.content })),
            { role: 'user', content: llmPrompt },
          ];

          reportProgress?.('Generating response with Local LLM');
          const completion = await LocalLlmClient.generateCompletion(chatMessages, localLlmConfig, {
            temperature: localLlmConfig.temperature,
            abortSignal: reqAbortController?.signal || abortSignal,
            attachments,
          });
          throwIfCancelled(reqAbortController?.signal || abortSignal);
          if (!completion.text?.trim() || completion.text.trim() === '(Empty response returned by local model)') {
            throw new Error('Local LLM returned an empty response.');
          }

          globalThreadManager.recordTurn(scopedThreadId, 'localllm', maskedText, completion.text);
          globalThreadManager.markPresetPromptsSent(scopedThreadId, 'localllm');
          globalThreadManager.setSession(scopedThreadId, 'localllm', `local://session/${scopedThreadId}`, projectName);

          executionResult = { text: completion.text, provider: 'localllm', modelUsed: modelName };
          successfulProvider = 'localllm';
          successfulAccount = { id: 'localllm_default', alias: `Local (${localLlmConfig.preset})` };
          wasNewChat = isLocalNewChat;
          break;
        } catch (err: any) {
          throwIfCancelled(reqAbortController?.signal || abortSignal);
          err.providerUsed = providerId;
          console.error(`[Transgentic] Local LLM execution failed:`, err?.message || err);
          lastCandidateError = err;
          continue;
        }
      }

      // Check developer & user service toggle
      const cfg = ModelRegistryManager.getProviderConfig(providerId);
      if (cfg && !cfg.serviceEnabled) {
        console.warn(`[Transgentic] Provider ${providerId} is disabled in ModelRegistry. Skipping to next candidate.`);
        lastCandidateError = new Error(`Service "${providerId}" is disabled in Model Registry.`);
        continue;
      }
      if (!ServiceManifestManager.isServiceEnabled(providerId)) {
        console.warn(`[Transgentic] Provider ${providerId} is disabled in ServiceManifest. Skipping to next candidate.`);
        lastCandidateError = new Error(`Service "${providerId}" is disabled in Service Manifest.`);
        continue;
      }

      const serviceEntry = ServiceManifestManager.getManifest().services[providerId];
      if (serviceEntry?.providerType === 'api' || providerId.startsWith('api_')) {
        try {
          if (globalRateLimiter.isRateLimited(providerId)) throw new Error('[RATE_LIMIT] API service is cooling down.');
          reportProgress?.(`Generating response with ${getProviderDisplayName(providerId)}`);
          this.updateCoreState('processing', providerId, `Processing on ${serviceEntry?.name || providerId}`);
          globalRateLimiter.recordRequest(providerId);
          const result = await this.completionGateway.completeProviderPrompt(
            providerId,
            effectiveMode,
            maskedText,
            attachments,
            reqAbortController?.signal || abortSignal,
            requestedModel,
            pipeline,
          );
          if (!result.message.content?.trim()) throw new Error(`${serviceEntry?.name || providerId} returned an empty response.`);
          executionResult = { text: result.message.content, provider: providerId, modelUsed: result.model };
          successfulProvider = providerId;
          successfulAccount = { id: `${providerId}_api`, alias: serviceEntry?.name || providerId };
          globalRateLimiter.markSuccess(providerId);
          wasNewChat = true;
          break;
        } catch (error) {
          throwIfCancelled(reqAbortController?.signal || abortSignal);
          const err = error as Error & { providerUsed?: ProviderId };
          err.providerUsed = providerId;
          lastCandidateError = err;
          if (forcedProvider) throw err;
          continue;
        }
      }

      const activeAccount = AccountRegistryManager.getActiveAccount(providerId);
      if (!activeAccount) {
        console.warn(`[Transgentic] No active account configured for provider ${providerId}. Skipping to next provider in fallback chain.`);
        lastCandidateError = new Error(`No active account configured for provider "${providerId}".`);
        continue;
      }

      let providerStatus = globalSessionManager.getStatus(providerId);
      if (!providerStatus?.isAuthenticated) {
        try {
          providerStatus = await globalSessionManager.refreshProviderStatus(providerId);
        } catch {}
      }

      if (providerStatus?.isAuthenticated && (activeAccount.status === 'error' || activeAccount.status === 'unauthenticated')) {
        activeAccount.status = 'ready';
        AccountRegistryManager.markStatus(providerId, activeAccount.id, 'ready');
      }

      if (activeAccount.status === 'rate_limited') {
        console.warn(`[Transgentic] Provider ${providerId} (${activeAccount.alias}) is rate-limited. Trying next fallback service.`);
        lastCandidateError = new Error(`[RATE_LIMIT] Profile "${activeAccount.alias}" on ${providerId} is currently rate-limited.`);
        continue;
      }
      if ((activeAccount.status === 'error' || activeAccount.status === 'unauthenticated') && !providerStatus?.isAuthenticated) {
        console.warn(`[Transgentic] Provider ${providerId} (${activeAccount.alias}) requires manual login. Trying next fallback service.`);
        lastCandidateError = new Error(`[SECURITY_WARNING] Profile "${activeAccount.alias}" on ${providerId} requires manual login or verification in Drawer.`);
        continue;
      }

      const adapter = globalSessionManager.getAdapter(providerId);
      if (!adapter) {
        console.warn(`[Transgentic] No adapter found for provider ${providerId}. Skipping.`);
        lastCandidateError = new Error(`No adapter found for provider "${providerId}".`);
        continue;
      }

      this.updateCoreState('routing', providerId, `Routing to ${providerId} (${activeAccount.alias})...`);

      const targetModel =
        DynamicRouter.resolveTargetModel(providerId, effectiveMode, requestedModel, pipeline) ||
        ModelRegistryManager.getEffectiveModel(providerId, requestedModel) ||
        undefined;

      // Different conversations/accounts and independently cancellable requests must
      // never share a provider result. Preserve byte-exact prompts in the key.
      const dedupScope = JSON.stringify([effectiveThreadId, activeAccount.id, isAgenticClient,
        isBalanced, Boolean(newThread), attachmentIdentity, abortSignal ? reqId : 'shared']);

      const inFlight = DuplicateActionGuard.getInFlight(
        providerId,
        effectiveMode,
        targetModel,
        maskedText,
        dedupScope
      );

      if (inFlight) {
        console.warn(
          `[Transgentic] Duplicate in-flight prompt detected for provider "${providerId}". Coalescing.`
        );
        try {
          executionResult = await inFlight.promise;
          throwIfCancelled(reqAbortController?.signal || abortSignal);
          successfulProvider = providerId;
          successfulAccount = activeAccount;
          break; // Shared adapter output still needs normal response finalization below.
        } catch (err) {
          throwIfCancelled(reqAbortController?.signal || abortSignal);
          lastCandidateError = err;
          if (forcedProvider) throw err;
          continue;
        }
      }

      let resolveInFlight!: (val: any) => void;
      let rejectInFlight!: (err: any) => void;
      const inFlightPromise = new Promise((resolve, reject) => {
        resolveInFlight = resolve;
        rejectInFlight = reject;
      });
      // The owner handles candidate failures even when no duplicate caller is waiting.
      void inFlightPromise.catch(() => {});

      DuplicateActionGuard.register(
        reqId,
        providerId,
        effectiveMode,
        targetModel,
        maskedText,
        inFlightPromise,
        dedupScope
      );

      let isNewChat = false;
      try {
        reportProgress?.(`Queued for ${getProviderDisplayName(providerId)}`);
        executionResult = await AccountQueueManager.runTask(activeAccount.id, reqId, async () => {
          throwIfCancelled(reqAbortController?.signal || abortSignal);
          this.updateCoreState('processing', providerId, `Processing on ${providerId} (${activeAccount.alias})...`);
          globalSessionManager.updateProviderState(providerId, 'busy');

          const contents = await globalSessionManager.ensureWebContents(providerId, activeAccount.partitionKey);
          await globalRateLimiter.applyJitter(effectiveMode);

          const projectMeta = {
            projectName,
            topic: maskedText.slice(0, 30),
            requestId: reqId,
          };

          const statusCheck = await adapter.checkRateLimit();
          if (statusCheck.isRateLimited) {
            throw new Error(`[RATE_LIMIT] ${providerId} reported rate limit or usage cap.`);
          }

          globalRateLimiter.recordRequest(providerId);

          const scopedThreadId = `${effectiveThreadId}_${activeAccount.id}`;
          const existingSession = globalThreadManager.getSession(scopedThreadId, providerId);
          const isTooLong = !newThread && existingSession && globalThreadManager.shouldRollover(scopedThreadId, providerId, 10, 30000);

          if (newThread || isTooLong || (isolateConversation && !existingSession)) {
            isNewChat = true;
            await adapter.navigateToNewChat();
            globalThreadManager.removeSession(scopedThreadId, providerId);
            if (isTooLong) {
              wasRolledOver = true;
            }
          } else if (existingSession?.webChatUrl) {
            const currentUrl = (contents?.getURL() || '').trim();
            if (currentUrl && !currentUrl.includes(existingSession.webChatUrl) && currentUrl !== existingSession.webChatUrl) {
              await adapter.navigateToConversation(existingSession.webChatUrl);
            }
            const presetsAlreadySent = globalThreadManager.hasPresetPromptsBeenSent(scopedThreadId, providerId);
            isNewChat = !presetsAlreadySent;
          } else {
            const currentUrl = (contents?.getURL() || '').trim();
            if (currentUrl) {
              globalThreadManager.setSession(scopedThreadId, providerId, currentUrl, projectName);
            }
            const presetsAlreadySent = globalThreadManager.hasPresetPromptsBeenSent(scopedThreadId, providerId);
            isNewChat = !presetsAlreadySent;
          }

          if (targetModel) {
            await ModelScraperEngine.selectRequestedModel(providerId, targetModel, contents);
          }

          let promptToSend = maskedText;
          if (isNewChat) {
            if (isAgenticClient && isBalanced) {
              promptToSend = wrapBalancedAgenticPrompt(promptToSend, taskIntent || effectiveMode);
            } else if (isAgenticClient) {
              promptToSend = wrapUnbalancedAgenticPrompt(promptToSend, taskIntent || effectiveMode);
            }
            if (this.config?.recall) {
              promptToSend = applyRecallPipeline(promptToSend, this.config.recall, effectiveMode);
            }
          }

          // Local Zero-Leak & Compact (Coding mode only)
          if (effectiveMode === 'coding' && activeLocalLlmConfig?.enabled && activeLocalLlmConfig?.localZeroLeak) {
            const leakResult = globalLocalZeroLeakManager.sanitizePrompt(promptToSend, reqId);
            promptToSend = leakResult.sanitizedText;
          }
          if (effectiveMode === 'coding' && activeLocalLlmConfig?.enabled && activeLocalLlmConfig?.localCompact) {
            const compactResult = await globalLocalCompactManager.compactPrompt(
              promptToSend,
              activeLocalLlmConfig,
              reqAbortController?.signal || abortSignal
            );
            if (compactResult.wasCompacted) {
              promptToSend = compactResult.compactedText;
            }
          }

          let adapterResult: any;
          const releaseDomLock = await adapter.acquireDomLock();
          try {
            throwIfCancelled(reqAbortController?.signal || abortSignal);
            reportProgress?.(`Generating response with ${getProviderDisplayName(providerId)}`);
            try {
              adapterResult = await adapter.executePrompt(promptToSend, effectiveMode, projectMeta, undefined, reqAbortController?.signal || abortSignal, attachments);
            } catch (promptErr: any) {
              if (promptErr?.message && /conversation (?:is getting|too) long|context[ _]length/i.test(promptErr.message)) {
                await adapter.navigateToNewChat();
                globalThreadManager.removeSession(scopedThreadId, providerId);
                wasRolledOver = true;
                let rolloverPrompt = maskedText;
                if (isAgenticClient && isBalanced) {
                  rolloverPrompt = wrapBalancedAgenticPrompt(rolloverPrompt, taskIntent || effectiveMode);
                } else if (isAgenticClient) {
                  rolloverPrompt = wrapUnbalancedAgenticPrompt(rolloverPrompt, taskIntent || effectiveMode);
                }
                if (this.config?.recall) {
                  rolloverPrompt = applyRecallPipeline(rolloverPrompt, this.config.recall, effectiveMode);
                }
                adapterResult = await adapter.executePrompt(rolloverPrompt, effectiveMode, projectMeta, undefined, reqAbortController?.signal || abortSignal, attachments);
              } else {
                throw promptErr;
              }
            }
          } finally {
            releaseDomLock();
          }
          throwIfCancelled(reqAbortController?.signal || abortSignal);

          if (!adapterResult?.text?.trim() && !adapterResult?.media) {
            throw new Error(`${providerId} returned an empty response.`);
          }

          globalRateLimiter.markSuccess(providerId);
          AccountRegistryManager.markReady(providerId, activeAccount.id);
          globalSessionManager.updateProviderState(providerId, 'ready');

          globalThreadManager.recordTurn(scopedThreadId, providerId, maskedText, adapterResult.text || '');
          globalThreadManager.markPresetPromptsSent(scopedThreadId, providerId);
          const activeUrl = await adapter.getConversationUrl();
          if (activeUrl && activeUrl !== adapter.url) {
            globalThreadManager.setSession(scopedThreadId, providerId, activeUrl, projectName);
          }

          let savedMediaRelPath: string | undefined = undefined;
          if (adapterResult.media) {
            reportProgress?.('Saving generated asset');
            let cookieHeader: string | undefined;
            try {
              const sess = globalSessionManager.sessions.get(providerId);
              if (sess) {
                const cookies = await sess.cookies.get({});
                if (cookies && cookies.length > 0) {
                  cookieHeader = cookies.map((c: any) => `${c.name}=${c.value}`).join('; ');
                }
              }
            } catch {}

            const saved = await globalAssetManager.saveMediaAsset(
              adapterResult.media.data,
              adapterResult.media.type,
              adapterResult.media.suggestedName,
              cookieHeader,
              effectiveMode
            );
            savedMediaRelPath = saved.filePath;
          }

          let cleanAdapterText = adapterResult.text || '';
          if (cleanAdapterText.includes('data:')) {
            const parsed = await globalAssetManager.sanitizeAndPersistEmbeddedBase64(
              cleanAdapterText,
              providerId,
              effectiveMode
            );
            cleanAdapterText = parsed.text;
            if (!savedMediaRelPath && parsed.firstExtractedPath) {
              savedMediaRelPath = parsed.firstExtractedPath;
            }
          }

          return {
            text: cleanAdapterText,
            mediaPath: savedMediaRelPath,
            provider: providerId,
            modelUsed: targetModel || undefined,
          };
        });

        resolveInFlight(executionResult);
        successfulProvider = providerId;
        successfulAccount = activeAccount;
        wasNewChat = isNewChat;
        break;
      } catch (candidateErr: any) {
        rejectInFlight(candidateErr);
        throwIfCancelled(reqAbortController?.signal || abortSignal);
        candidateErr.providerUsed = providerId;
        if (candidateErr.message?.includes('[MODEL_SELECTION_FAILED]')) {
          globalSessionManager.updateProviderState(providerId, 'ready');
          throw candidateErr;
        }
        const isRateLimit =
          candidateErr.message?.includes('[RATE_LIMIT]') ||
          candidateErr.message?.includes('rate limit') ||
          candidateErr.message?.includes('capacity') ||
          candidateErr.message?.includes('429');

        if (isRateLimit) {
          AccountRegistryManager.markRateLimited(providerId, activeAccount.id, 3600);
          globalRateLimiter.markRateLimited(providerId);
          globalSessionManager.updateProviderState(providerId, 'rate_limited');
        } else {
          AccountRegistryManager.markStatus(providerId, activeAccount.id, 'error');
          globalSessionManager.updateProviderState(providerId, 'disconnected');
        }

        lastCandidateError = candidateErr;
        console.warn(`[Transgentic] Provider ${providerId} (${activeAccount.alias}) failed: ${candidateErr.message}.`);

        if (forcedProvider) {
          throw candidateErr;
        }
      } finally {
        DuplicateActionGuard.unregister(
          providerId,
          effectiveMode,
          targetModel,
          maskedText,
          dedupScope
        );
      }
    }

    if (!executionResult || !successfulProvider || !successfulAccount) {
      const failure = lastCandidateError || new Error(`All candidate AI services in fallback chain failed for mode "${effectiveMode}".`);
      failure.providerUsed ||= candidateProviders.at(-1);
      throw failure;
    }

    let sanitizedText = globalBlindingEngine.unblind(executionResult.text);
    if (globalLocalZeroLeakManager.hasSecretsForRequest(reqId)) {
      sanitizedText = globalLocalZeroLeakManager.restoreResponse(sanitizedText, reqId);
    }

    if (sanitizedText && sanitizedText.includes('data:')) {
      const parsed = await globalAssetManager.sanitizeAndPersistEmbeddedBase64(
        sanitizedText,
        successfulProvider,
        effectiveMode
      );
      sanitizedText = parsed.text;
      if (!executionResult.mediaPath && parsed.firstExtractedPath) {
        executionResult.mediaPath = parsed.firstExtractedPath;
      }
    }

    const activeMediaPath = executionResult.mediaPath;
    let finalResponseWithLocalPath = sanitizedText;
    if (activeMediaPath) {
      const localPathNotice = `Local media asset saved to: ${activeMediaPath}`;
      if (!finalResponseWithLocalPath || finalResponseWithLocalPath === '(Empty response received from provider)') {
        finalResponseWithLocalPath = localPathNotice;
      } else if (!finalResponseWithLocalPath.includes(activeMediaPath)) {
        finalResponseWithLocalPath = `${localPathNotice}\n\n${finalResponseWithLocalPath}`;
      }
    } else if (!finalResponseWithLocalPath || finalResponseWithLocalPath.trim().length === 0) {
      finalResponseWithLocalPath = '(Empty response received from provider)';
    }

    if (globalLocalZeroLeakManager.hasSecretsForRequest(reqId)) {
      finalResponseWithLocalPath = globalLocalZeroLeakManager.restoreResponse(finalResponseWithLocalPath, reqId);
    }

    if (wasRolledOver && isAgenticClient) {
      const providerName = successfulProvider === 'localllm' ? 'Local LLM' : (successfulProvider?.toUpperCase() || 'AI Service');
      const promptBrief = maskedText.slice(0, 160).replace(/\n/g, ' ');
      const outputBrief = finalResponseWithLocalPath.slice(0, 200).replace(/\n/g, ' ');
      const rolloverNotice = (
        `\n\n---\n` +
        `[TRANSGENTIC AUTO-NEW-CHAT NOTICE]:\n` +
        `The conversation with ${providerName} reached the maximum conversation length budget. Transgentic has automatically archived the previous thread and opened a fresh new chat session for your next request to preserve token budget, avoid webview bloat, and maintain high-speed responses.\n\n` +
        `COMPACT CONTINUITY SUMMARY:\n` +
        `- Completed Query: "${promptBrief}"\n` +
        `- Output Summary: "${outputBrief}"\n` +
        `- Next Action: Ready to continue with your upcoming instructions in the fresh chat.\n\n` +
        `CONTINUITY INSTRUCTION FOR AGENTIC CLIENT:\n` +
        `When sending your next request via Transgentic MCP, include the summary above so ${providerName} retains context in the clean session.`
      );
      finalResponseWithLocalPath += rolloverNotice;
    }

    return {
      text: sanitizedText,
      finalResponseWithLocalPath,
      mediaPath: activeMediaPath,
      provider: successfulProvider,
      modelUsed: executionResult.modelUsed,
      account: successfulAccount,
      wasNewChat,
      wasRolledOver,
    };
  }

  public async orchestratePrompt(
    rawPrompt: string,
    mode: AcceptedTaskMode,
    forcedProvider?: ProviderId,
    projectName?: string,
    requestedModel?: string,
    abortSignal?: AbortSignal,
    threadId?: string,
    newThread?: boolean,
    isQuickPrompt?: boolean,
    isStrictExplicitMode?: boolean,
    caller?: CallerContext,
    rawFiles?: unknown,
    attachmentRequirement?: 'image-only' | 'image-or-video'
  ): Promise<any> {
    const startTime = Date.now();
    this.requestCounter++;
    const reqId = `req_${Date.now()}_${this.requestCounter}`;
    const contextId = globalBlindingEngine.createRequestContext();

    // 1. Data Blinding Pipeline (with Request-Scoped Context)
    const { maskedText, replacementsCount } = globalBlindingEngine.blind(rawPrompt, contextId);
    let log: McpRequestLog | null = null;
    let reqAbortController: AbortController | null = null;
    const responseProfile: ResponseProfile = isQuickPrompt ? 'plain' : (caller?.profile || 'agentic');
    const isAgenticClient = responseProfile === 'agentic';
    let effectiveResponseMode: TaskMode = normalizeTaskMode(mode);
    let detachAbort: (() => void) | undefined;
    let attachmentCleanup: (() => Promise<void>) | undefined;
    let attachments: readonly StagedAttachment[] = [];
    let requestEnvelope: NormalizedRequestEnvelope | undefined;

    try {
      // 2. Intelligent Intent Classification
      const { mode: effectiveMode, intent: taskIntent, isAutoDetected } = DynamicRouter.classifyMode(rawPrompt, mode, isStrictExplicitMode);
      effectiveResponseMode = effectiveMode;
      throwIfCancelled(abortSignal);
      const staged = await AttachmentManager.stage(rawFiles, { loopback: caller?.isLoopback === true, mode: effectiveMode, signal: abortSignal });
      attachments = staged.envelope.files;
      attachmentCleanup = staged.cleanup;
      requestEnvelope = {
        promptText: rawPrompt,
        mode: effectiveMode,
        attachments: staged.envelope,
        caller: { transport: isQuickPrompt ? 'desktop' : caller?.isLoopback ? 'loopback' : 'remote', sessionId: caller?.sessionId },
      };
      if (attachmentRequirement === 'image-only' && attachments.some(file => file.kind !== 'image')) throw new Error('edit_image accepts image attachments only.');
      if (attachmentRequirement === 'image-or-video' && attachments.some(file => file.kind !== 'image' && file.kind !== 'video')) throw new Error('edit_video accepts image or video attachments only.');
      if (effectiveMode === 'audio') {
        const unavailableLog: McpRequestLog = {
          id: reqId,
          timestamp: startTime,
          mode: 'audio',
          intent: 'audio',
          targetProvider: 'none',
          status: 'failed',
          outcome: 'failed',
          maskedSecretsCount: replacementsCount,
          promptSnippet: maskedText.slice(0, 160),
          promptText: maskedText,
          responseText: AUDIO_MODE_UNAVAILABLE_MESSAGE,
          responseSnippet: AUDIO_MODE_UNAVAILABLE_MESSAGE.slice(0, 160),
          durationMs: Date.now() - startTime,
          autoClassified: isAutoDetected,
          isQuickPrompt: !!isQuickPrompt,
        };
        this.addLog(unavailableLog);
        this.updateCoreState('idle');
        return withResponseDetails({
          isError: true,
          content: [{ type: 'text', text: AUDIO_MODE_UNAVAILABLE_MESSAGE }],
          metadata: { mode: 'audio', intent: 'audio', directive: 'audio_provider_unavailable', durationMs: Date.now() - startTime },
        }, { status: 'failed', mode: 'audio', responseProfile });
      }
      const balancedModeConfig = this.config?.balancedMode ?? this.config?.coding?.balancedMode ?? true;
      const isBalanced = isQuickPrompt ? (effectiveMode === 'coding' && balancedModeConfig) : balancedModeConfig;
      const doubleAgentCfg = this.config?.doubleAgent ?? { enabled: false, includeLocalLlm: false };
      const scenario = determineDispatchScenario(isBalanced, doubleAgentCfg, effectiveMode);
      const shouldRunScenario2 = !forcedProvider && scenario === 'scenario_2_dual_dispatch';

      // Micro-task classification for Coding mode ONLY
      const microTask = effectiveMode === 'coding'
        ? classifyMicroTask(rawPrompt)
        : { isMicroTask: false };

      const activeLocalLlmConfig = this.config?.localLLM || DynamicRouter.getLocalLlmConfig();
      const isLocalLlmAvailable = Boolean(activeLocalLlmConfig?.enabled);
      const isLocalMicroTaskEnabled = Boolean(activeLocalLlmConfig?.localMicroTask);

      // 3. Resolve Candidate Chain of Providers (Main pipeline)
      let candidateProviders: ProviderId[] = forcedProvider
        ? [forcedProvider]
        : DynamicRouter.getCandidateChain(effectiveMode, undefined, true, 'main', doubleAgentCfg.includeLocalLlm);

      candidateProviders = this.filterAttachmentCapableProviders(candidateProviders, attachments, effectiveMode, requestedModel, forcedProvider);

      if (caller?.cliRequest?.workspaceId) {
        if (forcedProvider && !isCliProvider(forcedProvider)) throw new Error('Workspace execution requires a CLI provider.');
        candidateProviders = candidateProviders.filter(isCliProvider);
      }
      const isLocalLlmInRoute = candidateProviders.includes('localllm');

      const conversationId =
        threadId ||
        (isQuickPrompt ? 'quick_prompt_session' : (projectName ? `project_${projectName}` : 'default_mcp_thread'));
      let effectiveThreadId = caller
        ? JSON.stringify([isQuickPrompt ? 'quick_prompt' : 'mcp', caller.sessionId, responseProfile, effectiveMode, conversationId])
        : conversationId;

      if (caller?.cliRequest?.workspaceId) effectiveThreadId = JSON.stringify([effectiveThreadId, caller.cliRequest.workspaceId, caller.cliRequest.allowCommands, caller.cliRequest.allowProjectEditing]);
      const defaultProvider = candidateProviders[0];
      const defaultAccount = (isCliProvider(defaultProvider) ? globalCliRuntime.identity(defaultProvider) : defaultProvider ? AccountRegistryManager.getActiveAccount(defaultProvider) : undefined);
      const defaultScopedThreadId = isCliProvider(defaultProvider)
        ? JSON.stringify([effectiveThreadId, defaultProvider, 'native', caller?.cliRequest?.workspaceId ?? DynamicRouter.getRule(effectiveMode).cliWorkspaces?.[defaultProvider] ?? null])
        : defaultAccount
        ? `${effectiveThreadId}_${defaultAccount.id}`
        : `${effectiveThreadId}_${defaultProvider}`;
      const existingPrimarySession = globalThreadManager.getSession(defaultScopedThreadId, defaultProvider);
      const isAfterTurnOne = !newThread && Boolean(
        existingPrimarySession &&
        (existingPrimarySession.messageCount > 0 || globalThreadManager.hasPresetPromptsBeenSent(defaultScopedThreadId, defaultProvider))
      );

      let bypassedWebviewDispatch = false;
      if (
        effectiveMode === 'coding' &&
        isLocalMicroTaskEnabled &&
        microTask.isMicroTask &&
        !forcedProvider &&
        !caller?.cliRequest?.workspaceId &&
        !candidateProviders.some(p => isCliProvider(p) && DynamicRouter.getRule(effectiveMode).cliWorkspaces?.[p]) &&
        isLocalLlmAvailable &&
        !shouldRunScenario2
      ) {
        if (candidateProviders.length === 0 || isLocalLlmInRoute || isAfterTurnOne) {
          candidateProviders = ['localllm', ...candidateProviders.filter((p) => p !== 'localllm')];
          bypassedWebviewDispatch = true;
        }
      }

      if (candidateProviders.length === 0 && !shouldRunScenario2) {
        const directiveText = isAgenticClient
          ? formatCodexFallbackDirective(effectiveMode, isLocalMicroTaskEnabled && isLocalLlmAvailable)
          : `No AI service is available for ${effectiveMode} mode. Select an available service in Routing.`;
        const fallbackLog: McpRequestLog = {
          id: reqId,
          timestamp: startTime,
          mode: effectiveMode,
          ...(taskIntent ? { intent: taskIntent } : {}),
          targetProvider: 'none',
          status: isAgenticClient ? 'success' : 'failed',
          outcome: isAgenticClient ? 'handoff' : 'failed',
          maskedSecretsCount: replacementsCount,
          promptSnippet: maskedText.slice(0, 160),
          promptText: maskedText,
          responseText: directiveText,
          responseSnippet: directiveText.slice(0, 160),
          durationMs: Date.now() - startTime,
          balancedModeApplied: isBalanced,
          autoClassified: isAutoDetected,
          isQuickPrompt: !!isQuickPrompt,
          isMicroTask: microTask.isMicroTask,
        };
        this.addLog(fallbackLog);
        this.updateCoreState('idle');
        return withResponseDetails({
          content: [{ type: 'text', text: directiveText }],
          isError: !isAgenticClient,
          metadata: {
            mode: effectiveMode,
            directive: 'no_routed_service',
            durationMs: Date.now() - startTime,
          },
        }, { status: isAgenticClient ? 'handoff' : 'failed', mode: effectiveMode, responseProfile });
      }

      const initialProvider = candidateProviders[0] || 'chatgpt';
      const initialAccount = (isCliProvider(initialProvider) ? globalCliRuntime.identity(initialProvider) : AccountRegistryManager.getActiveAccount(initialProvider));

      log = {
        id: reqId,
        timestamp: startTime,
        mode: effectiveMode,
        ...(taskIntent ? { intent: taskIntent } : {}),
        targetProvider: initialProvider,
        accountProfileId: initialAccount?.id,
        accountAlias: initialAccount?.alias,
        status: 'pending',
        maskedSecretsCount: replacementsCount,
        promptSnippet: maskedText.slice(0, 160),
        promptText: maskedText,
        balancedModeApplied: isBalanced,
        autoClassified: isAutoDetected,
        isQuickPrompt: !!isQuickPrompt,
        isMicroTask: microTask.isMicroTask,
        microTaskCategory: microTask.category,
        bypassedWebviewDispatch,
        bypassedCloudDispatch: bypassedWebviewDispatch,
        ...attachmentLogSummary(attachments),
      };
      this.addLog(log);

      reqAbortController = new AbortController();
      if (abortSignal) {
        if (abortSignal.aborted) {
          reqAbortController.abort();
        } else {
          const onAbort = () => reqAbortController?.abort();
          abortSignal.addEventListener('abort', onAbort, { once: true });
          detachAbort = () => abortSignal.removeEventListener('abort', onAbort);
        }
      }
      this.activeAbortControllers.set(reqId, reqAbortController);

      let executionResult: any = null;
      let successfulProvider: ProviderId | null = null;
      let successfulAccount: any = null;
      let activeMediaPath: string | undefined = undefined;
      let finalResponseWithLocalPath = '';
      let wasRolledOver = false;
      let wasNewChat = false;
      let providers: ProviderOutcome[] = [];
      let artifacts: string[] = [];
      let partial = false;

      // 4. Execution Dispatching: Scenario 2 vs Single Pipeline
      if (shouldRunScenario2) {
        const mainCandidates = this.filterAttachmentCapableProviders(DynamicRouter.getCandidateChain(effectiveMode, undefined, true, 'main', doubleAgentCfg.includeLocalLlm).filter(p => !caller?.cliRequest?.workspaceId || isCliProvider(p)), attachments, effectiveMode, requestedModel);
        const coCandidates = this.filterAttachmentCapableProviders(DynamicRouter.getCandidateChain(effectiveMode, undefined, true, 'co', doubleAgentCfg.includeLocalLlm).filter(p => !caller?.cliRequest?.workspaceId || isCliProvider(p)), attachments, effectiveMode, requestedModel);

        if (mainCandidates.length === 0 && coCandidates.length === 0) {
          throw new Error(`No available AI services found for mode "${effectiveMode}" in either Main or Co pipelines.`);
        }

        const dualResult = await executeConcurrentDualDispatch(
          () => this.executePipelineCandidateChain({
            candidateProviders: mainCandidates,
            effectiveMode,
            taskIntent,
            maskedText,
            contextId,
            projectName,
            requestedModel,
            abortSignal,
            effectiveThreadId: `${effectiveThreadId}_main`,
            newThread,
            isQuickPrompt,
            isBalanced: false,
            microTask,
            reqAbortController,
            isAgenticClient,
            pipeline: 'main',
            reportProgress: caller?.reportProgress,
            isolateConversation: Boolean(caller),
            cliRequest: caller?.cliRequest,
            reqId: `${reqId}_main`,
            startTime,
            bypassedWebviewDispatch,
            forcedProvider,
            requestEnvelope,
          }),
          () => this.executePipelineCandidateChain({
            candidateProviders: coCandidates,
            effectiveMode,
            taskIntent,
            maskedText,
            contextId,
            projectName,
            requestedModel,
            abortSignal,
            effectiveThreadId: `${effectiveThreadId}_co`,
            newThread,
            isQuickPrompt,
            isBalanced: false,
            microTask,
            reqAbortController,
            isAgenticClient,
            pipeline: 'co',
            reportProgress: caller?.reportProgress,
            isolateConversation: Boolean(caller),
            cliRequest: caller?.cliRequest,
            reqId: `${reqId}_co`,
            startTime,
            bypassedWebviewDispatch,
            forcedProvider,
            requestEnvelope,
          }),
          mainCandidates[0] || 'chatgpt',
          coCandidates[0] || 'claude'
        );

        finalResponseWithLocalPath = dualResult.combinedText;
        partial = Boolean(dualResult.mainError || dualResult.coError);
        providers = [
          { role: 'main', status: dualResult.mainResult ? 'completed' : 'failed',
            provider: dualResult.mainResult?.provider || (dualResult.mainError as any)?.providerUsed || mainCandidates[0],
            model: dualResult.mainResult?.modelUsed, error: dualResult.mainError?.message },
          { role: 'co', status: dualResult.coResult ? 'completed' : 'failed',
            provider: dualResult.coResult?.provider || (dualResult.coError as any)?.providerUsed || coCandidates[0],
            model: dualResult.coResult?.modelUsed, error: dualResult.coError?.message },
        ];
        artifacts = [...new Set([dualResult.mainResult?.mediaPath, dualResult.coResult?.mediaPath].filter((p): p is string => Boolean(p)))];
        successfulProvider = dualResult.mainResult?.provider || dualResult.coResult?.provider || mainCandidates[0];
        successfulAccount = {
          id: (dualResult.mainResult as any)?.account?.id || dualResult.mainResult?.accountProfileId || (dualResult.coResult as any)?.account?.id || dualResult.coResult?.accountProfileId || 'dual',
          alias: (dualResult.mainResult as any)?.account?.alias || dualResult.mainResult?.accountAlias || (dualResult.coResult as any)?.account?.alias || dualResult.coResult?.accountAlias || 'Dual Agent',
        };
        activeMediaPath = dualResult.mainResult?.mediaPath || dualResult.coResult?.mediaPath;
        executionResult = {
          text: dualResult.combinedText,
          provider: providers.filter((p) => p.status === 'completed').map((p) => p.provider).join(' + ') as ProviderId,
          modelUsed: dualResult.mainResult?.modelUsed || dualResult.coResult?.modelUsed,
          mediaPath: activeMediaPath,
        };
        wasRolledOver = Boolean(dualResult.mainResult?.wasRolledOver || dualResult.coResult?.wasRolledOver);
        wasNewChat = Boolean(dualResult.mainResult?.wasNewChat || dualResult.coResult?.wasNewChat);
      } else {
        const pipelineResult = await this.executePipelineCandidateChain({
          candidateProviders,
          effectiveMode,
          taskIntent,
          maskedText,
          contextId,
          projectName,
          requestedModel,
          abortSignal,
          effectiveThreadId,
          newThread,
          isQuickPrompt,
          isBalanced,
          microTask,
          reqAbortController,
          isAgenticClient,
          pipeline: 'main',
          reportProgress: caller?.reportProgress,
          isolateConversation: Boolean(caller),
            cliRequest: caller?.cliRequest,
          reqId,
          startTime,
          bypassedWebviewDispatch,
          forcedProvider,
          requestEnvelope,
        });

        finalResponseWithLocalPath = pipelineResult.finalResponseWithLocalPath;
        successfulProvider = pipelineResult.provider;
        successfulAccount = pipelineResult.account;
        activeMediaPath = pipelineResult.mediaPath;
        executionResult = pipelineResult;
        wasRolledOver = pipelineResult.wasRolledOver;
        wasNewChat = pipelineResult.wasNewChat;
        providers = [{ role: 'main', status: 'completed', provider: successfulProvider!, model: executionResult.modelUsed }];
        artifacts = activeMediaPath ? [activeMediaPath] : [];
      }

      throwIfCancelled(reqAbortController.signal);
      if (['image', 'video', 'music'].includes(effectiveMode) && artifacts.length === 0) partial = true;
      log.outcome = partial ? 'partial' : 'completed';
      if (shouldRunScenario2) {
        log.status = 'success';
        log.targetProvider = executionResult.provider;
      } else {
        const isFallback = successfulProvider !== initialProvider;
        log.status = isFallback ? 'fallback' : 'success';
        if (isFallback) {
          log.targetProvider = initialProvider;
          log.fallbackProvider = successfulProvider;
        } else {
          log.targetProvider = successfulProvider;
        }
      }
      log.accountProfileId = successfulAccount.id;
      log.accountAlias = successfulAccount.alias;
      log.durationMs = Date.now() - startTime;
      log.responseText = finalResponseWithLocalPath;
      log.responseSnippet = activeMediaPath
        ? `[Local Media: ${path.basename(activeMediaPath)}] ${finalResponseWithLocalPath.slice(0, 180)}`
        : finalResponseWithLocalPath.slice(0, 240);
      log.mediaPath = activeMediaPath;
      log.modelUsed = executionResult.modelUsed;
      log.attachmentDestinations = providers.filter(provider => provider.status === 'completed').map(provider => String(provider.provider));
      if (log.presetPromptsAttached === undefined) {
        log.presetPromptsAttached = wasNewChat;
      }
      this.updateLog(log);
      this.updateCoreState('idle');

      const contentItems: any[] = [];
      contentItems.push({
        type: 'text',
        text: finalResponseWithLocalPath,
      });

      // 5. Directive & Guidance Injection
      if (isAgenticClient) {
        if (scenario === 'scenario_1_balanced_double') {
          // Scenario 1: Double Agent + Balanced Mode -> Strict trailing structural cross-examination directive
          contentItems.push({
            type: 'text',
            text: `\n\n---\n${formatBalancedDoubleAgentDirective()}`,
          });
        } else if (shouldRunScenario2) {
          // Scenario 2: Double Agent enabled without balanced mode -> Concurrent dual dispatch with Transgentic-weighted directive
          contentItems.push({
            type: 'text',
            text: `\n\n---\n${formatDualDispatchDoubleAgentDirective()}`,
          });
        } else if (isCliProvider(successfulProvider)) {
          contentItems.push({ type: 'text', text: `\n\n---\n[TRANSGENTIC CLI GUIDANCE]\n${CLI_DEFINITIONS[successfulProvider].name} answered under the configured workspace permissions. Continue within the user's requested scope; coding mode does not grant editing or command access.` });
        } else if (scenario === 'standard_balanced') {
          if (successfulProvider === 'localllm' && (isBalanced || isLocalMicroTaskEnabled)) {
            const reminderText = wasNewChat
              ? formatBalancedLocalLlmDirective(executionResult.modelUsed || 'local', effectiveMode)
              : formatLocalLlmDecisionReminder(executionResult.modelUsed || 'local', effectiveMode);
            contentItems.push({
              type: 'text',
              text: `\n\n---\n${reminderText}`,
            });
          } else if (successfulProvider !== 'localllm') {
            const isRecallOn = isRecallEnabledForMode(this.config || undefined, effectiveMode);
            const reminderText = wasNewChat
              ? formatBalancedWebAiDirective(successfulProvider, isRecallOn, effectiveMode)
              : formatWebAiDecisionReminder(successfulProvider, effectiveMode);
            contentItems.push({
              type: 'text',
              text: `\n\n---\n${reminderText}`,
            });
          }
        } else if (!isBalanced) {
          // Standard Single without balanced mode -> Remind agentic IDE to mention "use Transgentic MCP" every time
          const activeProviderName = successfulProvider || executionResult?.provider || candidateProviders[0];
          const reminderText = formatUnbalancedAgenticReminder(activeProviderName);
          contentItems.push({
            type: 'text',
            text: `\n\n---\n${reminderText}`,
          });
        }
      }

      if (!activeMediaPath && isAgenticClient && ['image', 'video', 'music'].includes(effectiveMode)) {
        contentItems.push({
          type: 'text',
          text: `\n[NOTE FOR AGENTIC CLIENT]: Transgentic completed the query but no downloadable media asset file was returned from ${executionResult.provider}. If your workflow requires an asset file, fallback to your own local generation tools or alternative approaches.`,
        });
      }

      return withResponseDetails({
        content: contentItems,
        metadata: {
          providerUsed: executionResult.provider,
          modelUsed: executionResult.modelUsed,
          mode: effectiveMode,
          ...(taskIntent ? { intent: taskIntent } : {}),
          accountUsed: successfulAccount.alias,
          maskedSecretsCount: replacementsCount,
          durationMs: Date.now() - startTime,
        },
      }, { status: partial ? 'partial' : 'completed', mode: effectiveMode, responseProfile, providers, artifacts });
    } catch (err: any) {
      const cancelled = Boolean(abortSignal?.aborted || reqAbortController?.signal.aborted || err?.name === 'AbortError');
      if (log) {
        log.status = 'failed';
        log.outcome = cancelled ? 'cancelled' : 'failed';
        let errMessage = err?.message || 'Execution failed';
        if (errMessage.toLowerCase().includes('terminated by user') && !abortSignal?.aborted && !reqAbortController?.signal.aborted) {
          errMessage = 'Request interrupted or empty response';
        }
        log.error = errMessage;
        log.durationMs = Date.now() - startTime;
        log.responseSnippet = `[Error: ${log.error}]`;
        this.updateLog(log);
      }

      // 7. Hard-Stop Policy on terminal failure
      const providerId: ProviderId | undefined = err?.providerUsed || forcedProvider;
      const isRateLimit =
        err.message?.includes('[RATE_LIMIT]') ||
        err.message?.includes('rate limit') ||
        err.message?.includes('capacity') ||
        err.message?.includes('429');

      this.updateCoreState('idle');

      const haltGuardActive = isAgenticClient && isAgentHaltGuardEnabled(this.config || undefined, effectiveResponseMode);
      if (!cancelled && haltGuardActive && isRateLimit) {
        const cooldownEstimate = 'unknown; check the provider';
        if (providerId) emitRateLimitNotification(providerId, cooldownEstimate);

        return withResponseDetails({
          isError: true,
          content: [
            {
              type: 'text',
              text: formatAgentHaltDirective(providerId || 'AI service', cooldownEstimate),
            },
          ],
          metadata: {
            providerUsed: providerId,
            mode: effectiveResponseMode,
            agentHaltTriggered: true,
            durationMs: Date.now() - startTime,
          },
        }, { status: 'failed', mode: effectiveResponseMode, responseProfile, failedProvider: providerId });
      }

      const errorText = cancelled ? 'Request cancelled.' : (err?.message || 'Request execution stopped');
      const content = [{ type: 'text', text: errorText }];
      if (!cancelled && isAgenticClient) content.push({ type: 'text', text: '[TRANSGENTIC GUIDANCE]: This request failed. Consider another approach within the user\'s requested scope.' });
      return withResponseDetails({ isError: true, content, metadata: { mode: effectiveResponseMode, providerUsed: providerId } },
        { status: cancelled ? 'cancelled' : 'failed', mode: effectiveResponseMode, responseProfile, failedProvider: providerId });
    } finally {
      detachAbort?.();
      this.activeAbortControllers.delete(reqId);
      await attachmentCleanup?.();
      // 8. Request-scoped 'finally' purge: GUARANTEES all volatile tokens for this request are purged
      globalBlindingEngine.purgeRequestContext(contextId);
      globalLocalZeroLeakManager.purgeRequestContext(reqId);
      globalLocalZeroLeakManager.purgeRequestContext(`${reqId}_main`);
      globalLocalZeroLeakManager.purgeRequestContext(`${reqId}_co`);
    }
  }

  public async start(): Promise<number> {
    return new Promise((resolve, reject) => {
      const tryListen = (attemptPort: number) => {
        const lanEnabled = this.config?.serverAccess?.lanEnabled === true;
        const bindHost = lanEnabled ? '0.0.0.0' : '127.0.0.1';
        const displayHost = lanEnabled ? (this.config?.serverAccess?.advertisedAddress || '0.0.0.0') : '127.0.0.1';
        this.httpServer = this.app
          .listen(attemptPort, bindHost, () => {
            const address = this.httpServer?.address();
            this.port = address && typeof address !== 'string' ? address.port : attemptPort;
            globalCliRuntime.setGatewayPort(this.port);
            console.log(`[Transgentic MCP Server] Listening on http://${displayHost}:${this.port}`);
            resolve(this.port);
          })
          .on('error', (err: any) => {
            if (err.code === 'EADDRINUSE') {
              console.warn(`[Transgentic MCP Server] Port ${attemptPort} in use, trying ${attemptPort + 1}`);
              tryListen(attemptPort + 1);
            } else {
              console.error('[Transgentic MCP Server] Failed to start:', err);
              reject(err);
            }
          });
      };

      tryListen(this.port);
    });
  }

  public stop(): Promise<void> {
    return new Promise((resolve) => {
      if (this.httpServer) {
        const server = this.httpServer;
        this.httpServer = null;
        SseTransportManager.closeAll();
        server.close(() => resolve());
        server.closeIdleConnections?.();
        server.closeAllConnections?.();
      } else {
        resolve();
      }
    });
  }

  public async restart(newPort?: number): Promise<number> {
    await this.stop();
    if (newPort && typeof newPort === 'number') {
      this.port = newPort;
    }
    return await this.start();
  }

  public getPort(): number {
    return this.port;
  }

  public setMode(mode: TaskMode): void {
    this.currentMode = mode;
    this.notifyCoreStatus();
  }

  public getCoreStatus(): CoreStatus {
    return {
      state: this.currentCoreState,
      activeProvider: this.activeProvider,
      activeMode: this.currentMode,
      currentTaskDescription: this.currentTaskDescription,
      requestCount: this.requestCounter,
      totalTokensProtected: globalBlindingEngine.getTokens().length,
      activeVaultSecrets: globalBlindingEngine.getTokens().length,
      port: this.port,
      uptimeSeconds: Math.floor((Date.now() - this.startTime) / 1000),
    };
  }

  public getRequestLogs(limit = 20, offset = 0): { logs: McpRequestLog[]; total: number } {
    return globalLogStorage.query(limit, offset);
  }

  public clearRequestLogs(): void {
    globalLogStorage.clear();
    this.requestLogs = [];
  }

  private updateCoreState(state: CoreStatus['state'], activeProvider?: ProviderId, taskDesc?: string): void {
    this.currentCoreState = state;
    this.activeProvider = activeProvider;
    this.currentTaskDescription = taskDesc;
    this.notifyCoreStatus();
  }

  private addLog(log: McpRequestLog): void {
    this.requestLogs.unshift(log);
    if (this.requestLogs.length > 100) this.requestLogs.pop();
    globalLogStorage.insert(log);
    for (const listener of this.logListeners) {
      try {
        listener(log);
      } catch {}
    }
  }

  private updateLog(log: McpRequestLog): void {
    const idx = this.requestLogs.findIndex((l) => l.id === log.id);
    if (idx !== -1) {
      this.requestLogs[idx] = { ...log };
    }
    globalLogStorage.update(log);
    for (const listener of this.logListeners) {
      try {
        listener({ ...log });
      } catch {}
    }
  }

  public terminateRequest(logId: string, reason = 'Terminated by user: Request stopped'): boolean {
    const controller = this.activeAbortControllers.get(logId);
    if (controller) {
      try {
        controller.abort(new Error(reason));
      } catch {}
      this.activeAbortControllers.delete(logId);
    }

    const log = this.requestLogs.find((l) => l.id === logId);
    if (log) {
      log.status = 'failed';
      log.error = reason;
      log.durationMs = Date.now() - log.timestamp;
      log.responseSnippet = `[Terminated: ${reason}]`;
      this.updateLog(log);
      this.updateCoreState('idle');
      return true;
    }

    const updated = globalLogStorage.updateStatus(logId, 'failed', reason);
    if (updated) {
      this.updateLog(updated);
      this.updateCoreState('idle');
      return true;
    }
    return false;
  }

  public terminateAllPendingRequests(reason = 'All pending requests terminated by user'): number {
    let count = 0;
    for (const [id, controller] of this.activeAbortControllers.entries()) {
      try {
        controller.abort(new Error(reason));
      } catch {}
    }
    this.activeAbortControllers.clear();

    for (const log of this.requestLogs) {
      if (log.status === 'pending') {
        log.status = 'failed';
        log.error = reason;
        log.durationMs = Date.now() - log.timestamp;
        log.responseSnippet = `[Terminated: ${reason}]`;
        this.updateLog(log);
        count++;
      }
    }

    const pendingStored = globalLogStorage.getPending();
    for (const stored of pendingStored) {
      if (!this.requestLogs.some((l) => l.id === stored.id)) {
        stored.status = 'failed';
        stored.error = reason;
        stored.durationMs = Date.now() - stored.timestamp;
        stored.responseSnippet = `[Terminated: ${reason}]`;
        this.updateLog(stored);
        count++;
      }
    }

    this.updateCoreState('idle');
    return count;
  }

  private notifyCoreStatus(): void {
    const status = this.getCoreStatus();
    for (const listener of this.coreStatusListeners) {
      try {
        listener(status);
      } catch {}
    }
  }

  public onLog(cb: (log: McpRequestLog) => void): () => void {
    this.logListeners.push(cb);
    return () => {
      this.logListeners = this.logListeners.filter((l) => l !== cb);
    };
  }

  public onCoreStatus(cb: (status: CoreStatus) => void): () => void {
    this.coreStatusListeners.push(cb);
    return () => {
      this.coreStatusListeners = this.coreStatusListeners.filter((l) => l !== cb);
    };
  }
}

export const globalMcpServer = new TransgenticMcpServer(58420);
