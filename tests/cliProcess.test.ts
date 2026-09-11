import { describe, it, expect } from 'vitest';
import { CliProcess } from '../src/main/cli/processRunner.js';
import { adapterArgs, executeAdapter } from '../src/main/cli/adapters.js';
const policy = { cwd: process.cwd(), allowProjectEditing: false, allowCommands: false };
function launch(script: string, signal?: AbortSignal) {
  return new CliProcess(process.execPath, ['-e', script], { cwd: process.cwd(), env: {}, timeoutMs: 2000, signal });
}
describe('CLI process completion and cancellation', () => {
  it('passes image attachments through Codex native --image flags and references documents read-only', () => {
    const attachments: any[] = [
      { path: '/scratch/ref.png', name: 'ref.png', mimeType: 'image/png', kind: 'image', size: 1, sha256: 'a' },
      { path: '/scratch/spec.pdf', name: 'spec.pdf', mimeType: 'application/pdf', kind: 'document', size: 1, sha256: 'b' },
    ];
    const args = adapterArgs('cli_codex', { prompt: 'inspect', policy, attachments });
    expect(args).toContain('--image=/scratch/ref.png');
    expect(args).not.toContain('/scratch/spec.pdf');
  });
  it('does not mistake reconnect notices for terminal Codex failures', async () => {
    const proc = launch(`process.stdin.resume(); console.log(JSON.stringify({type:'error',message:'Reconnecting 1/5'}));console.log(JSON.stringify({type:'thread.started',thread_id:'owned'}));console.log(JSON.stringify({type:'item.completed',item:{type:'agent_message',text:'answer'}}));console.log(JSON.stringify({type:'turn.completed'}));`);
    try { expect(await executeAdapter('cli_codex', proc, { prompt: 'x', policy })).toMatchObject({ text: 'answer', sessionId: 'owned' }); await proc.waitForExit(); }
    finally { proc.stop(); }
  });
  it('rejects a failed exit even after a terminal result', async () => {
    const proc = launch(`process.stdin.resume();console.log(JSON.stringify({type:'turn.completed'}));process.exitCode=2;`);
    try { await executeAdapter('cli_codex', proc, { prompt: 'x', policy }); await expect(proc.waitForExit()).rejects.toThrow('unsuccessfully'); }
    finally { proc.stop(); }
  });
  it('rejects a partial answer without a completion event', async () => {
    const proc = launch(`process.stdin.resume();console.log(JSON.stringify({type:'item.completed',item:{type:'agent_message',text:'partial'}}));`);
    try { await expect(executeAdapter('cli_codex', proc, { prompt: 'x', policy })).rejects.toThrow('before completion'); }
    finally { proc.stop(); }
  });
  it('cancels the owned process promptly', async () => {
    const controller = new AbortController(); const proc = launch('setInterval(()=>{}, 1000)', controller.signal);
    const task = executeAdapter('cli_codex', proc, { prompt: 'x', policy }); controller.abort();
    await expect(task).rejects.toMatchObject({ name: 'AbortError' }); await proc.closed;
    expect(proc.child.signalCode).toBe('SIGTERM');
  });
});
describe('Grok ACP adapter', () => {
  it('uses an explicit session and denies ungranted edits and host callbacks', async () => {
    let event: (event: any) => void = () => {};
    const calls: string[] = [];
    const proc: any = {
      onEvent(fn: any) { event = fn; return () => {}; },
      async request(method: string, params: any) {
        calls.push(method);
        if (method === 'initialize') { expect(params.clientCapabilities).toEqual({ fs: { readTextFile: true } }); return { authMethods: [{ id: 'cached_token' }] }; }
        if (method === 'session/load') { expect(params.sessionId).toBe('owned'); expect(params.mcpServers).toEqual([]); return {}; }
        if (method === 'session/prompt') {
          expect(await proc.onRequest('session/request_permission', { toolCall: { kind: 'edit' }, options: [{ kind: 'allow_once', optionId: 'yes' }] })).toEqual({ outcome: { outcome: 'cancelled' } });
          await expect(proc.onRequest('fs/write_text_file', {})).rejects.toThrow('not exposed');
          event({ method: 'session/update', params: { sessionId: 'other', update: { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: 'wrong scope' } } } });
          event({ method: 'session/update', params: { sessionId: 'owned', update: { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: 'answer' } } } });
          return { stopReason: 'end_turn' };
        }
        return {};
      },
    };
    expect(await executeAdapter('cli_grok', proc, { prompt: 'x', policy, sessionId: 'owned' })).toEqual({ text: 'answer', sessionId: 'owned', permissionDenied: true });
    expect(calls).toEqual(['initialize', 'authenticate', 'session/load', 'session/prompt']);
  });

  it('negotiates ACP image capability before sending native image blocks', async () => {
    const calls: any[] = [];
    const proc: any = {
      onEvent() { return () => {}; },
      async request(method: string, params: any) {
        calls.push([method, params]);
        if (method === 'initialize') return { agentCapabilities: { promptCapabilities: { image: true } } };
        if (method === 'session/new') return { sessionId: 'vision' };
        if (method === 'session/prompt') return { stopReason: 'end_turn' };
        return {};
      },
    };
    const imagePath = new URL(import.meta.url).pathname;
    await executeAdapter('cli_grok', proc, { prompt: 'inspect', policy, attachments: [{ path: imagePath, name: 'source.png', mimeType: 'image/png', kind: 'image', size: 1, sha256: 'a' }] });
    const prompt = calls.find(([method]) => method === 'session/prompt')[1].prompt;
    expect(prompt.some((block: any) => block.type === 'image' && block.mimeType === 'image/png')).toBe(true);
  });
});
