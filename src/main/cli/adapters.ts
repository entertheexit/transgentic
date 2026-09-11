import type { CliProviderId } from '../../shared/cli.js';
import type { ExecutionPolicy } from './executionPolicy.js';
import { CliProcess } from './processRunner.js';
import fs from 'node:fs';
import type { StagedAttachment } from '../../shared/attachments.js';

export interface CliResult { wasNewChat?: boolean; text: string; sessionId?: string; modelUsed?: string; usage?: Record<string, number>; permissionDenied?: boolean; actions?: { commands: number; fileChanges: number } }
export interface AdapterInput { prompt: string; model?: string; sessionId?: string; policy: ExecutionPolicy; progress?: (message: string) => void; attachments?: readonly StagedAttachment[] }

function promptWithAttachmentManifest(input: AdapterInput): string {
  if (!input.attachments?.length) return input.prompt;
  const lines = input.attachments.map(file => `- ${file.name} (${file.mimeType}): ${file.path}`);
  return `${input.prompt}\n\nAttached files are request-scoped, read-only inputs. Inspect their contents when relevant; do not modify them:\n${lines.join('\n')}`;
}
export function adapterArgs(id: CliProviderId, input: AdapterInput): string[] {
  // The mandatory outer OS sandbox enforces permissions. A nested macOS sandbox cannot initialize;
  // Codex must delegate confinement to that boundary for its native patch helper to work.
  if (id === 'cli_codex') return ['exec', '--ignore-user-config', '--ignore-rules', '--json', '--skip-git-repo-check', '--sandbox', 'danger-full-access',
    '-c', 'features.plugins=false', '-c', `features.shell_tool=${input.policy.allowCommands}`, '-c', `features.unified_exec=${input.policy.allowCommands}`,
    ...(input.model ? ['--model', input.model] : []), ...(input.attachments || []).filter(file => file.kind === 'image').map(file => `--image=${file.path}`), ...(input.sessionId ? ['resume', input.sessionId] : []), '-'];
  if (id === 'cli_grok') return ['--no-auto-update', 'agent', 'stdio'];
  if (id === 'cli_claude_code') return ['--safe-mode', '-p', '--verbose', '--output-format', 'stream-json', '--permission-mode', 'dontAsk', '--tools', [
    'Read', 'Glob', 'Grep', ...(input.policy.allowProjectEditing ? ['Edit', 'Write'] : []), ...(input.policy.allowCommands ? ['Bash'] : []),
  ].join(','), '--allowedTools', ['Read', 'Glob', 'Grep', ...(input.policy.allowProjectEditing ? ['Edit', 'Write'] : []), ...(input.policy.allowCommands ? ['Bash'] : [])].join(','), '--disallowedTools', 'mcp__*', ...(input.model ? ['--model', input.model] : []), ...(input.sessionId ? ['--resume', input.sessionId] : [])];
  return ['-p', promptWithAttachmentManifest(input), '--output-format', 'stream-json', '--disable-slash-commands', ...(input.model ? ['--model', input.model] : []), ...(input.sessionId ? ['--conversation', input.sessionId] : [])];
}

function boundedText(text: string) { if (Buffer.byteLength(text) > 16 * 1024 * 1024) throw new Error('CLI answer exceeds the output limit.'); return text; }

export async function executeAdapter(id: CliProviderId, proc: CliProcess, input: AdapterInput): Promise<CliResult> {

  if (id === 'cli_grok') return executeGrok(proc, input);
  return new Promise((resolve, reject) => {
    let settled = false; let model: string | undefined; let codexText = ''; let codexSession: string | undefined;
    const actions = { commands: 0, fileChanges: 0 };
    const stop = (result?: CliResult, error?: Error) => { if (settled) return; settled = true; off(); offFailure(); if (error) reject(error); else { proc.markComplete?.(); resolve(result!); } };
    const off = proc.onEvent(event => {
      try {
        if (id === 'cli_codex') {
          if (event.type === 'item.completed' && event.item?.type === 'command_execution') actions.commands++;
          if (event.type === 'item.completed' && event.item?.type === 'file_change') actions.fileChanges++;
          if (event.type === 'thread.started') codexSession = event.thread_id;
          if (event.type === 'item.completed' && event.item?.type === 'agent_message') codexText = boundedText(event.item.text || '');
          if (event.type === 'turn.failed') return stop(undefined, new Error('Codex could not complete the turn. Check native sign-in and the selected model.'));
          if (event.type === 'turn.completed') stop({ text: codexText, sessionId: codexSession || input.sessionId, usage: event.usage, actions });
        } else if (id === 'cli_claude_code') {
          if (event.type === 'system' && event.subtype === 'init') model = event.model;
          if (event.type === 'result') {
            if (event.is_error || (event.subtype && event.subtype !== 'success')) return stop(undefined, new Error('Claude Code did not complete the request. Check permissions, model and authentication.'));
            stop({ text: boundedText(typeof event.result === 'string' ? event.result : ''), sessionId: event.session_id, modelUsed: model,
              usage: event.usage, permissionDenied: Boolean(event.permission_denials?.length) });
          }
        } else if (event.event === 'result') {
          const r = event.result;
          if (r?.status !== 'SUCCESS') {
            const detail = typeof r?.error === 'string' ? r.error.replace(/\s+/g, ' ').trim().slice(0, 500) : '';
            return stop(undefined, new Error(detail ? `Antigravity did not complete the request: ${detail}` : 'Antigravity did not complete the request. Check its native login, selected model, and account availability.'));
          }
          stop({ text: boundedText(typeof r.response === 'string' ? r.response : ''), sessionId: r.conversation_id, usage: r.usage });
        }
        if (event.type === 'assistant' || event.event === 'step_update') input.progress?.('CLI is processing the request');
      } catch (error) { stop(undefined, error as Error); }
    });
    let offFailure: () => void = () => {};
    offFailure = proc.onFailure(error => stop(undefined, error));
    if (id === 'cli_claude_code' || id === 'cli_codex') proc.child.stdin.end(promptWithAttachmentManifest(input));
    else proc.child.stdin.end();
  });
}

async function executeGrok(proc: CliProcess, input: AdapterInput): Promise<CliResult> {
  let denied = false;
  proc.onRequest = async (method, params) => {
    if (method !== 'session/request_permission') throw new Error('Host filesystem and terminal callbacks are not exposed.');
    const kind = params.toolCall?.kind;
    const allowed = kind === 'read' || kind === 'search' || (kind === 'edit' && input.policy.allowProjectEditing) || (kind === 'execute' && input.policy.allowCommands);
    const option = allowed && params.options?.find((o: any) => o.kind === 'allow_once');
    if (!option) { denied = true; return { outcome: { outcome: 'cancelled' } }; }
    return { outcome: { outcome: 'selected', optionId: option.optionId } };
  };
  const initialized = await proc.request('initialize', { protocolVersion: 1, clientCapabilities: { fs: { readTextFile: true } }, clientInfo: { name: 'transgentic', version: '1.0.1' } });
  const auth = initialized.authMethods?.find((m: any) => m.id === 'cached_token');
  if (auth) await proc.request('authenticate', { methodId: auth.id, _meta: { headless: true } });
  const session = await proc.request(input.sessionId ? 'session/load' : 'session/new', { cwd: input.policy.cwd, mcpServers: [], ...(input.sessionId ? { sessionId: input.sessionId } : {}) });
  const sessionId = input.sessionId || session.sessionId;
  if (typeof sessionId !== 'string') throw new Error('Grok did not return a session ID.');
  if (input.model) await proc.request('session/set_model', { sessionId, modelId: input.model });
  let text = '';
  const off = proc.onEvent(event => {
    if (event.method !== 'session/update' || event.params?.sessionId !== sessionId) return;
    const update = event.params.update;
    if (update?.sessionUpdate === 'agent_message_chunk' && update.content?.type === 'text') text = boundedText(text + update.content.text);
    else input.progress?.('Grok is processing the request');
  });
  try {
    const promptCapabilities = initialized.agentCapabilities?.promptCapabilities || initialized.promptCapabilities || {};
    const blocks: any[] = [{ type: 'text', text: promptWithAttachmentManifest(input) }];
    for (const file of input.attachments || []) {
      if (file.kind === 'image') {
        if (promptCapabilities.image !== true) throw new Error('Grok ACP did not advertise image prompt capability.');
        blocks.push({ type: 'image', mimeType: file.mimeType, data: fs.readFileSync(file.path).toString('base64') });
      } else {
        if (promptCapabilities.embeddedContext !== true) throw new Error('Grok ACP did not advertise embedded-resource prompt capability.');
        blocks.push({ type: 'resource', resource: { uri: `file://${file.path}`, name: file.name, mimeType: file.mimeType, blob: fs.readFileSync(file.path).toString('base64') } });
      }
    }
    const result = await proc.request('session/prompt', { sessionId, prompt: blocks });
    if (result.stopReason !== 'end_turn') throw new Error(`Grok stopped without completing (${result.stopReason || 'unknown'}).`);
    return { text, sessionId, permissionDenied: denied };
  } finally { off(); }
}
