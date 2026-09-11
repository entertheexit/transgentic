import crypto from 'node:crypto';
import fs from 'node:fs';
import { isCliProvider, CLI_DEFINITIONS } from '../../shared/cli.js';
import type { CompletionMessage, CompletionModel, CompletionRequest, CompletionResult, CompletionTool, CompletionToolCall } from '../../shared/completion.js';
import type { ProviderId, TaskMode, TransgenticConfig } from '../../shared/types.js';
import { globalCliRuntime } from '../cli/cliRuntimeManager.js';
import { ServiceManifestManager } from '../registry/serviceManifest.js';
import { ModelRegistryManager } from '../registry/modelRegistry.js';
import { DynamicRouter } from '../mcp/router.js';
import { globalLocalCompactManager } from '../localllm/localCompact.js';
import type { StagedAttachment } from '../../shared/attachments.js';
import { AttachmentManager } from '../attachments/attachmentManager.js';
import type { AttachmentInput } from '../../shared/attachments.js';

const ROUTE_MODELS: Array<{ id: string; mode: TaskMode; name: string }> = [
  { id: 'transgentic/general', mode: 'general', name: 'Transgentic General' },
  { id: 'transgentic/writing', mode: 'writing', name: 'Transgentic Writing' },
  { id: 'transgentic/coding', mode: 'coding', name: 'Transgentic Coding' },
];

function normalizeEndpoint(baseUrl: string): string {
  const trimmed = baseUrl.trim().replace(/\/+$/, '');
  if (/\/chat\/completions$/i.test(trimmed)) return trimmed;
  return trimmed.endsWith('/v1') ? `${trimmed}/chat/completions` : `${trimmed}/v1/chat/completions`;
}

function textContent(content: CompletionMessage['content']): string {
  if (typeof content === 'string') return content;
  if (content == null) return '';
  return content.map(part => typeof part?.text === 'string' ? part.text : JSON.stringify(part)).join('\n');
}

export function serializeCompletionForProvider(messages: CompletionMessage[], tools?: CompletionTool[]): string {
  const transcript = messages.map(message => {
    const calls = message.tool_calls?.length ? `\nTool calls: ${JSON.stringify(message.tool_calls)}` : '';
    const toolId = message.tool_call_id ? ` [tool_call_id=${message.tool_call_id}]` : '';
    return `<${message.role}${toolId}>\n${textContent(message.content)}${calls}\n</${message.role}>`;
  }).join('\n\n');
  if (!tools?.length) {
    return `Answer the conversation below. Treat it as the complete conversation; do not use or claim any earlier session, project, or memory.\n\n${transcript}`;
  }
  const toolSpec = JSON.stringify(tools);
  return `You are the reasoning provider for another agent. The calling agent owns the project and will execute tools. Never execute a tool, command, or file operation yourself.\n\nAvailable tools:\n${toolSpec}\n\nConversation:\n${transcript}\n\nReturn exactly one JSON object and no markdown fence:\n{"type":"assistant","content":"text or null","tool_calls":[{"id":"unique call id","type":"function","function":{"name":"one available tool name","arguments":"valid JSON object encoded as a string"}}]}\nUse an empty tool_calls array for a normal answer. Do not invent tool names.`;
}

function extractJsonObject(raw: string): unknown {
  const trimmed = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  try { return JSON.parse(trimmed); } catch {}
  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');
  if (start >= 0 && end > start) return JSON.parse(trimmed.slice(start, end + 1));
  throw new Error('Provider returned malformed tool-call JSON.');
}

export function parseProviderToolEnvelope(raw: string, tools: CompletionTool[]): { content: string | null; tool_calls?: CompletionToolCall[] } {
  const value = extractJsonObject(raw) as any;
  if (!value || value.type !== 'assistant' || !Array.isArray(value.tool_calls)) throw new Error('Provider returned an invalid tool-call envelope.');
  const names = new Set(tools.map(tool => tool.function.name));
  const calls: CompletionToolCall[] = value.tool_calls.map((call: any, index: number) => {
    const name = call?.function?.name;
    if (typeof name !== 'string' || !names.has(name)) throw new Error(`Provider requested unknown tool "${String(name)}".`);
    const args = typeof call.function.arguments === 'string' ? call.function.arguments : JSON.stringify(call.function.arguments ?? {});
    const parsed = JSON.parse(args);
    if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') throw new Error(`Tool arguments for "${name}" must be a JSON object.`);
    return { id: typeof call.id === 'string' && call.id ? call.id : `call_${index}_${crypto.randomUUID()}`, type: 'function', function: { name, arguments: args } };
  });
  const content = value.content == null ? null : String(value.content);
  return { content, ...(calls.length ? { tool_calls: calls } : {}) };
}

function validateRequest(input: any): CompletionRequest {
  if (!input || typeof input !== 'object' || typeof input.model !== 'string') throw new Error('A model ID is required.');
  if (!Array.isArray(input.messages) || input.messages.length === 0) throw new Error('At least one message is required.');
  const roles = new Set(['system', 'developer', 'user', 'assistant', 'tool']);
  for (const message of input.messages) if (!message || !roles.has(message.role)) throw new Error('One or more messages have an invalid role.');
  if (input.n !== undefined && input.n !== 1) throw new Error('Transgentic supports n=1.');
  if (input.tools !== undefined && !Array.isArray(input.tools)) throw new Error('tools must be an array.');
  return input as CompletionRequest;
}

function completionAttachmentInputs(request: CompletionRequest): AttachmentInput[] {
  const files: AttachmentInput[] = [];
  for (const message of request.messages) {
    if (!Array.isArray(message.content)) continue;
    for (const part of message.content as any[]) {
      if (part?.type === 'image_url') {
        const url = typeof part.image_url === 'string' ? part.image_url : part.image_url?.url;
        if (typeof url !== 'string') throw new Error('image_url content parts require a URL.');
        files.push({ url, name: typeof part.name === 'string' ? part.name : undefined, mimeType: typeof part.mime_type === 'string' ? part.mime_type : undefined });
      } else if (part?.type === 'file') {
        const file = part.file;
        if (file?.file_id || part.file_id) throw new Error('file_id content parts cannot be routed because Transgentic does not own the provider file store. Supply inline file_data instead.');
        const data = file?.file_data || part.file_data;
        const name = file?.filename || part.filename;
        const mimeType = file?.mime_type || part.mime_type;
        if (typeof data !== 'string' || typeof name !== 'string') throw new Error('Inline file parts require filename and file_data.');
        if (data.startsWith('data:')) files.push({ url: data, name, mimeType: typeof mimeType === 'string' ? mimeType : undefined });
        else {
          if (typeof mimeType !== 'string') throw new Error('Raw base64 file_data requires mime_type.');
          files.push({ data, name, mimeType });
        }
      }
    }
  }
  return files;
}

function messagesWithoutBinaryParts(messages: CompletionMessage[]): CompletionMessage[] {
  return messages.map(message => !Array.isArray(message.content) ? message : {
    ...message,
    content: message.content.filter((part: any) => part?.type !== 'image_url' && part?.type !== 'file'),
  });
}

export class CompletionGateway {
  constructor(private getConfig: () => TransgenticConfig | null, private getPort: () => number) {}

  listModels(): CompletionModel[] {
    const manifest = ServiceManifestManager.getManifest();
    const models: CompletionModel[] = ROUTE_MODELS.map(route => ({ id: route.id, mode: route.mode, displayName: route.name }));
    for (const entry of Object.values(manifest.services)) {
      if (entry.id === 'localllm') continue;
      if (!this.isEligible(entry.id as ProviderId)) continue;
      models.push({ id: `transgentic/provider/${entry.id}`, provider: entry.id as ProviderId, displayName: entry.name });
    }
    if (this.isEligible('localllm')) models.push({ id: 'transgentic/provider/localllm', provider: 'localllm', displayName: 'Local LLM' });
    return models;
  }

  isEligible(provider: ProviderId): boolean {
    if (isCliProvider(provider)) {
      const service = globalCliRuntime.getServiceConfig(provider);
      return service.workMode === 'provider' && ServiceManifestManager.isServiceEnabled(provider) && globalCliRuntime.available(provider);
    }
    if (provider === 'localllm') return this.getConfig()?.localLLM?.enabled === true;
    const service = ServiceManifestManager.getManifest().services[provider];
    // Webview sessions are excluded until a recipe can prove temporary-chat and account-memory isolation.
    return Boolean(service?.enabled && (service.providerType === 'api' || provider.startsWith('api_')));
  }

  private resolveTarget(model: string): { mode: TaskMode; candidates: ProviderId[] } {
    const directPrefix = 'transgentic/provider/';
    if (model.startsWith(directPrefix)) {
      const provider = model.slice(directPrefix.length) as ProviderId;
      if (!this.isEligible(provider)) throw new Error(`Provider "${provider}" is unavailable for completion.`);
      return { mode: 'general', candidates: [provider] };
    }
    const route = ROUTE_MODELS.find(item => item.id === model);
    if (!route) throw new Error(`Unknown completion model "${model}".`);
    const rule = DynamicRouter.getRule(route.mode, 'main');
    const configured = [rule.defaultService || rule.primary, ...(rule.fallbackChain || rule.fallbacks || [])].filter(Boolean) as ProviderId[];
    const candidates = Array.from(new Set(configured)).filter(provider => this.isEligible(provider));
    if (!candidates.length) throw new Error(`No Provider Mode service is available for ${route.mode}. Configure its route or enable an eligible provider.`);
    return { mode: route.mode, candidates };
  }

  async complete(raw: unknown, signal?: AbortSignal, caller?: { loopback?: boolean }): Promise<CompletionResult> {
    let request = validateRequest(raw);
    const attachmentInputs = completionAttachmentInputs(request);
    const { mode, candidates } = this.resolveTarget(request.model);
    const staged = await AttachmentManager.stage(attachmentInputs, { loopback: caller?.loopback === true, mode, signal });
    const attachments = staged.envelope.files;
    const eligibleCandidates = attachments.length ? candidates.filter(provider => {
      if (isCliProvider(provider)) return provider !== 'cli_grok' || attachments.every(file => file.kind === 'image' || file.kind === 'document');
      if (provider === 'localllm') {
        const kinds = new Set(this.getConfig()?.localLLM?.attachmentKinds || []);
        return attachments.every(file => kinds.has(file.kind));
      }
      const service = ServiceManifestManager.getManifest().services[provider];
      const kinds = new Set(service?.attachmentKinds || []);
      return attachments.every(file => kinds.has(file.kind));
    }) : candidates;
    if (!eligibleCandidates.length) { await staged.cleanup(); throw new Error('No eligible completion provider declares support for all supplied attachments.'); }
    try {
    const hasToolContext = Boolean(request.tools?.length || request.messages.some(message => message.role === 'tool' || message.tool_calls?.length));
    const config = this.getConfig();
    const extras = hasToolContext ? undefined : {
      recall: config?.recall?.completionEnabled === true,
      compaction: config?.localLLM?.completionCompact === true,
      multiModelReview: config?.doubleAgent?.completionReviewEnabled === true,
    };
    if (extras?.recall) {
      request = {
        ...request,
        messages: [{ role: 'system', content: 'The caller explicitly enabled Recall for this text-only request. Consult provider-native memory or preferences only when they are available and relevant; do not invent remembered facts.' }, ...request.messages],
      };
    }
    if (extras?.compaction) {
      const local = config?.localLLM;
      if (local?.enabled) {
        const transcript = serializeCompletionForProvider(request.messages);
        const compacted = await globalLocalCompactManager.compactPrompt(transcript, { ...local, localCompact: true }, signal);
        if (compacted.wasCompacted) {
          request = {
            ...request,
            messages: [
              { role: 'system', content: 'The caller explicitly enabled local context compaction. Treat the supplied compacted transcript as the complete conversation context.' },
              { role: 'user', content: compacted.compactedText },
            ],
          };
        }
      }
    }
    let lastError: Error | undefined;
    for (const provider of eligibleCandidates) {
      try {
        const primary = await this.dispatch(provider, mode, request, signal, undefined, attachments);
        if (!extras?.multiModelReview || primary.message.tool_calls?.length) return primary;
        const coRule = DynamicRouter.getRule(mode, 'co');
        const reviewers = [coRule.defaultService || coRule.primary, ...(coRule.fallbackChain || coRule.fallbacks || [])]
          .filter(Boolean) as ProviderId[];
        const reviewer = Array.from(new Set(reviewers)).find(candidate => candidate !== primary.provider && this.isEligible(candidate));
        if (!reviewer) return primary;
        try {
          return await this.dispatch(reviewer, mode, {
            ...request,
            tools: undefined,
            tool_choice: undefined,
            messages: [
              ...request.messages,
              { role: 'assistant', content: primary.message.content },
              { role: 'user', content: 'Review the proposed answer for correctness and completeness. Return the corrected final answer only.' },
            ],
          }, signal, undefined, attachments);
        } catch {
          return primary;
        }
      }
      catch (error) {
        if (signal?.aborted) throw error;
        lastError = error as Error;
      }
    }
    throw lastError || new Error('No completion provider was available.');
    } finally {
      await staged.cleanup();
    }
  }

  async completeProviderPrompt(provider: ProviderId, mode: TaskMode, prompt: string, attachments: readonly StagedAttachment[], signal?: AbortSignal, requestedModel?: string, pipeline: 'main' | 'co' = 'main'): Promise<CompletionResult> {
    const content: Array<Record<string, unknown>> = [{ type: 'text', text: prompt }];
    for (const file of attachments) {
      const dataUrl = `data:${file.mimeType};base64,${(await fs.promises.readFile(file.path)).toString('base64')}`;
      if (file.kind === 'image') content.push({ type: 'image_url', image_url: { url: dataUrl } });
      else content.push({ type: 'file', file: { filename: file.name, file_data: dataUrl } });
    }
    return this.dispatch(provider, mode, {
      model: `transgentic/provider/${provider}`,
      messages: [{ role: 'user', content: attachments.length ? content : prompt }],
      stream: false,
    }, signal, requestedModel || DynamicRouter.resolveTargetModel(provider, mode, undefined, pipeline) || undefined);
  }

  private async dispatch(provider: ProviderId, mode: TaskMode, request: CompletionRequest, signal?: AbortSignal, requestedModel?: string, attachments: readonly StagedAttachment[] = []): Promise<CompletionResult> {
    if (isCliProvider(provider)) {
      const prompt = serializeCompletionForProvider(messagesWithoutBinaryParts(request.messages), request.tools);
      const id = `completion_${crypto.randomUUID()}`;
      const configuredModel = DynamicRouter.resolveTargetModel(provider, mode, undefined, 'main') || undefined;
      const result = await globalCliRuntime.execute(provider, prompt, {
        reqId: id, conversationKey: id, newThread: true, model: configuredModel || undefined,
        request: {}, signal, attachments,
      });
      const message = request.tools?.length
        ? { role: 'assistant' as const, ...parseProviderToolEnvelope(result.text, request.tools) }
        : { role: 'assistant' as const, content: result.text };
      return { message, finishReason: message.tool_calls?.length ? 'tool_calls' : 'stop', provider, model: result.modelUsed || configuredModel || CLI_DEFINITIONS[provider].name, usage: result.usage };
    }

    const config = this.getConfig();
    const service = provider === 'localllm' ? undefined : ServiceManifestManager.getManifest().services[provider];
    const baseUrl = provider === 'localllm' ? config?.localLLM?.baseUrl : service?.baseUrl;
    if (!baseUrl) throw new Error(`Provider "${provider}" has no completion endpoint.`);
    const endpoint = normalizeEndpoint(baseUrl);
    const parsed = new URL(endpoint);
    const ownHosts = new Set(['127.0.0.1', 'localhost', '::1', config?.serverAccess?.advertisedAddress].filter(Boolean));
    if (ownHosts.has(parsed.hostname) && Number(parsed.port || (parsed.protocol === 'https:' ? 443 : 80)) === this.getPort()) {
      throw new Error('A completion provider cannot point back to the Transgentic gateway.');
    }
    const model = requestedModel || (provider === 'localllm'
      ? config?.localLLM?.selectedModel || 'default'
      : DynamicRouter.resolveTargetModel(provider, mode, undefined, 'main') || service?.defaultModelId || 'default');
    const body: Record<string, unknown> = { ...request, model, stream: false };
    const response = await fetch(endpoint, {
      method: 'POST', signal,
      headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...(service?.apiKey ? { Authorization: `Bearer ${service.apiKey}` } : {}) },
      body: JSON.stringify(body),
    });
    if (!response.ok) throw new Error(`${service?.name || 'Local LLM'} returned HTTP ${response.status}: ${(await response.text()).slice(0, 300)}`);
    const data: any = await response.json();
    const choice = data.choices?.[0];
    if (!choice?.message) throw new Error(`${service?.name || 'Local LLM'} returned an invalid completion response.`);
    return {
      message: { role: 'assistant', content: choice.message.content ?? null, ...(choice.message.tool_calls ? { tool_calls: choice.message.tool_calls } : {}) },
      finishReason: choice.finish_reason === 'length' ? 'length' : choice.message.tool_calls?.length ? 'tool_calls' : 'stop',
      provider, model: data.model || model, usage: data.usage,
    };
  }
}
