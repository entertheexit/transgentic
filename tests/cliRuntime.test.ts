import { describe, it, expect, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { CLI_IDS, builtInCliServices, defaultCliService } from '../src/shared/cli.js';
import { resolvePolicy, cliEnvironment, macSandboxProfile, validatedMacUserKeychainPaths } from '../src/main/cli/executionPolicy.js';
import { JsonLineDecoder } from '../src/main/cli/processRunner.js';
import { adapterArgs, executeAdapter } from '../src/main/cli/adapters.js';
import { CliRuntimeManager, normalizeCliConfig, parseCliModelText, parseCodexModelList } from '../src/main/cli/cliRuntimeManager.js';

vi.mock('electron', () => ({ app: undefined }));

describe('CLI permissions and registration', () => {
  it('adds four disabled built-ins with no inferred web model availability', () => {
    const services = builtInCliServices();
    expect(Object.keys(services)).toEqual([...CLI_IDS]);
    for (const service of Object.values(services)) {
      expect(service.providerType).toBe('cli'); expect(service.enabled).toBe(false);
      expect(service.models[0].discoveredAvailable).toBe(false);
    }
  });
  it('defaults both permissions off even for malformed persisted values', () => {
    const config = normalizeCliConfig({ services: { cli_codex: { allowCommands: 'true', allowProjectEditing: 1 } }, workspaces: [] } as any);
    expect(config.services.cli_codex).toMatchObject({ allowCommands: false, allowProjectEditing: false });
    expect(normalizeCliConfig().workspaces).toEqual([]);
  });
  it.each([[false, false], [true, false], [false, true], [true, true]])('intersects workspace and service grants (editing %s, commands %s)', (editing, commands) => {
    const cwd = fs.realpathSync(os.tmpdir());
    const config = normalizeCliConfig({ services: { cli_codex: { ...defaultCliService(), workMode: 'agentic', allowProjectEditing: editing, allowCommands: commands } }, workspaces: [{ id: 'work', name: 'Work', path: cwd, allowMcp: true, grants: { cli_codex: { allowProjectEditing: true, allowCommands: true } } }] });
    expect(resolvePolicy(config, 'cli_codex', { workspaceId: 'work' }, false, '/scratch')).toMatchObject({ allowProjectEditing: editing, allowCommands: commands });
    expect(resolvePolicy(config, 'cli_codex', { workspaceId: 'work', allowProjectEditing: false, allowCommands: false }, false, '/scratch')).toMatchObject({ allowProjectEditing: false, allowCommands: false });
    expect(resolvePolicy(config, 'cli_codex', { allowProjectEditing: true, allowCommands: true }, true, '/scratch')).toMatchObject({ allowProjectEditing: false, allowCommands: false });
    expect(resolvePolicy(config, 'cli_codex', { workspaceId: 'work' }, true, '/scratch', true)).toMatchObject({ allowProjectEditing: false, allowCommands: false });
  });
  it('migrates legacy services to Provider Mode and rejects all host access', () => {
    const config = normalizeCliConfig({ services: { cli_codex: { allowCommands: true, allowProjectEditing: true } }, workspaces: [] } as any);
    expect(config.services.cli_codex).toMatchObject({ workMode: 'provider', allowCommands: false, allowProjectEditing: false });
    expect(resolvePolicy(config, 'cli_codex', {}, false, '/scratch')).toEqual({ cwd: '/scratch', allowCommands: false, allowProjectEditing: false });
    expect(() => resolvePolicy(config, 'cli_codex', { workspaceId: 'anything' }, false, '/scratch')).toThrow('Provider Mode');
    expect(() => resolvePolicy(config, 'cli_codex', { allowCommands: true }, true, '/scratch')).toThrow('Provider Mode');
  });
  it('rejects ungranted MCP workspaces and caller-provided paths', () => {
    const cwd = fs.realpathSync(os.tmpdir());
    const config = normalizeCliConfig({ services: { cli_codex: { ...defaultCliService(), workMode: 'agentic' } }, workspaces: [{ id: 'work', name: 'Work', path: cwd, allowMcp: false, grants: {} }] });
    expect(() => resolvePolicy(config, 'cli_codex', { workspaceId: 'work' }, false, '/scratch')).toThrow('not been granted');
    expect(() => resolvePolicy(config, 'cli_codex', { workspaceId: '/etc' }, true, '/scratch')).toThrow();
  });
  it('rejects a workspace replaced by a symlink', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tg-policy-test-'));
    const link = path.join(root, 'link'); fs.symlinkSync(os.tmpdir(), link);
    try {
      expect(() => resolvePolicy({ services: { cli_codex: { ...defaultCliService(), workMode: 'agentic' } }, workspaces: [{ id: 'w', path: link, name: 'w', grants: {}, allowMcp: true }] }, 'cli_codex', { workspaceId: 'w' }, true, root)).toThrow('path changed');
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
  });
  it('does not inherit gateway credentials, API keys, or loader options', () => {
    vi.stubEnv('TRANSGENTIC_TOKEN', 'private'); vi.stubEnv('NODE_OPTIONS', '--require untrusted.js'); vi.stubEnv('OPENAI_API_KEY', 'private');
    try { const env = cliEnvironment(); expect(env.TRANSGENTIC_TOKEN).toBeUndefined(); expect(env.NODE_OPTIONS).toBeUndefined(); expect(env.OPENAI_API_KEY).toBeUndefined(); }
    finally { vi.unstubAllEnvs(); }
  });
  it('does not grant project writes with command permission alone', () => {
    const profile = macSandboxProfile('/bin/tool', { cwd: '/project', allowCommands: true, allowProjectEditing: false }, '/scratch', []);
    const writeRule = profile.split('\n').find(line => line.startsWith('(deny file-write'))!;
    expect(writeRule).not.toContain('/project'); expect(profile).toContain('localhost:58420');
    const noCommand = macSandboxProfile('/bin/tool', { cwd: '/project', allowCommands: false, allowProjectEditing: true }, '/scratch', []);
    expect(noCommand).toContain('(deny process-exec');
  });
  it('allows only a fixed authentication helper while commands remain disabled', () => {
    const profile = macSandboxProfile('/bin/tool', { cwd: '/project', allowCommands: false, allowProjectEditing: false }, '/scratch', [], 58420, ['/usr/bin/security'], ['/Users/test/Library/Keychains/login.keychain-db'], ['/Users/test/.gemini/config/projects']);
    const execRule = profile.split('\n').find(line => line.startsWith('(deny process-exec'))!;
    expect(execRule).toContain('(literal "/bin/tool")');
    expect(execRule).toContain('(literal "/usr/bin/security")');
    expect(execRule).not.toContain('/bin/sh');
    const readRule = profile.split('\n').find(line => line.startsWith('(deny file-read-data (require-not'))!;
    expect(readRule).toContain('(literal "/Users/test/Library/Keychains/login.keychain-db")');
    expect(readRule).not.toContain('(subpath "/Users/test/Library/Keychains")');
    const writeRule = profile.split('\n').find(line => line.startsWith('(deny file-write'))!;
    expect(writeRule).toContain('(subpath "/Users/test/.gemini/config/projects")');
    expect(writeRule).not.toContain('(subpath "/Users/test/.gemini/config")');
  });
  it('accepts only user Keychain databases returned by macOS', () => {
    const output = '    "/Users/alex/Library/Keychains/login.keychain-db"\n"/Users/alex/Library/Keychains/work.keychain"\n"/tmp/escape.keychain-db"\nnot-json\n';
    expect(validatedMacUserKeychainPaths(output, '/Users/alex')).toEqual([
      '/Users/alex/Library/Keychains/login.keychain-db',
      '/Users/alex/Library/Keychains/work.keychain',
    ]);
  });
  it('keeps native configuration read-only during model discovery', () => {
    const standard = macSandboxProfile('/bin/tool', { cwd: '/scratch', allowCommands: false, allowProjectEditing: false }, '/scratch', ['/Users/test/.codex']);
    const discovery = macSandboxProfile('/bin/tool', { cwd: '/scratch', allowCommands: false, allowProjectEditing: false }, '/scratch', ['/Users/test/.codex'], 58420, [], [], [], true);
    expect(standard).toContain('(deny file-read-data (regex #"/(config\\.toml');
    expect(discovery).not.toContain('(deny file-read-data (regex #"/(config\\.toml');
    expect(discovery).toContain('(deny file-write* (regex #"/(config\\.toml');
    expect(discovery).toContain('(deny process-exec');
  });
});

describe('CLI model discovery', () => {
  it('parses native text catalogs and ignores headings and diagnostics', () => {
    expect(parseCliModelText(`Available models:\n\u001b[36mgemini-3.8-flash-high\u001b[0m  Gemini 3.8 Flash (High)\nmodel  display name\ngrok-4.6  Grok 4.6\nWARNING: refresh delayed\n`)).toEqual([
      { id: 'gemini-3.8-flash-high', name: 'Gemini 3.8 Flash (High)' },
      { id: 'grok-4.6', name: 'Grok 4.6' },
    ]);
  });
  it('uses Codex model slugs, removes duplicates, and bounds labels', () => {
    expect(parseCodexModelList([
      { id: 'internal-a', model: 'gpt-6-codex', displayName: 'GPT-6 Codex' },
      { id: 'internal-b', model: 'gpt-6-codex', displayName: 'Duplicate' },
      { id: 'internal-c', model: 'gpt-6-mini', displayName: 'GPT-6 Mini' },
      { id: '../invalid model', displayName: 'Invalid' },
    ])).toEqual([
      { id: 'gpt-6-codex', name: 'GPT-6 Codex' },
      { id: 'gpt-6-mini', name: 'GPT-6 Mini' },
    ]);
  });
  it('reports Claude model discovery as unsupported without invoking a model request', async () => {
    await expect(new CliRuntimeManager().discoverModels('cli_claude_code')).resolves.toMatchObject({ provider: 'cli_claude_code', state: 'unsupported', models: [] });
  });
});

describe('CLI structured protocols', () => {
  it('preserves split UTF-8 and multiple events', () => {
    const received: any[] = []; const parser = new JsonLineDecoder(e => received.push(e));
    const bytes = Buffer.from('{"text":"สวัสดี"}\n{"done":true}\n');
    for (let i = 0; i < bytes.length; i++) parser.push(bytes.subarray(i, i + 1));
    parser.finish(); expect(received).toEqual([{ text: 'สวัสดี' }, { done: true }]);
  });
  it('rejects malformed or oversized protocol input', () => {
    expect(() => new JsonLineDecoder(() => {}).push(Buffer.from('not json\n'))).toThrow();
    expect(() => new JsonLineDecoder(() => {}, 10).push(Buffer.from('a'.repeat(11)))).toThrow('size');
  });
  it('passes prompts literally and never resumes the most recent session', () => {
    for (const id of CLI_IDS) {
      const args = adapterArgs(id, { prompt: '$(touch /tmp/evil) `echo x`', sessionId: 'owned-id', policy: { cwd: '/scratch', allowCommands: false, allowProjectEditing: false } });
      expect(args).not.toContain('--continue'); expect(args).not.toContain('--last');
      expect(args.join(' ')).not.toContain('dangerously');
    }
  });
  it.each(['cli_claude_code', 'cli_antigravity'] as const)('extracts only the final answer from %s', async id => {
    let event: (e: any) => void = () => {};
    const proc = { onEvent: (fn: any) => { event = fn; return () => {}; }, onFailure: () => () => {}, child: { stdin: { end: vi.fn() } } };
    const task = executeAdapter(id, proc as any, { prompt: 'Hello', policy: { cwd: '/scratch', allowCommands: false, allowProjectEditing: false } });
    event({ type: 'assistant', message: { content: [{ text: 'intermediate' }] } });
    event(id === 'cli_claude_code' ? { type: 'result', subtype: 'success', result: 'Final answer', session_id: 'owned' } : { event: 'result', result: { status: 'SUCCESS', response: 'Final answer', conversation_id: 'owned' } });
    expect(await task).toMatchObject({ text: 'Final answer', sessionId: 'owned' });
  });
  it('includes Antigravity native failure details without multiline output', async () => {
    let event: (e: any) => void = () => {};
    const proc = { onEvent: (fn: any) => { event = fn; return () => {}; }, onFailure: () => () => {}, child: { stdin: { end: vi.fn() } } };
    const task = executeAdapter('cli_antigravity', proc as any, { prompt: 'Hello', policy: { cwd: '/scratch', allowCommands: false, allowProjectEditing: false } });
    event({ event: 'result', result: { status: 'ERROR', error: 'project metadata\nwas unavailable' } });
    await expect(task).rejects.toThrow('project metadata was unavailable');
  });
});

describe('CLI connection checks', () => {
  it('tests enabled services with isolated answer-only conversations', async () => {
    const runtime = new CliRuntimeManager();
    const execute = vi.spyOn(runtime, 'execute').mockResolvedValue({ text: 'Transgentic connection ready.' });
    await runtime.testEnabledConnections(['cli_codex', 'cli_grok', 'cli_codex']);
    expect(execute).toHaveBeenCalledTimes(2);
    for (const call of execute.mock.calls) {
      expect(call[1]).toBe('Reply with exactly: Transgentic connection ready.');
      expect(call[2]).toMatchObject({ newThread: true, desktop: true });
      expect(call[2].request).toBeUndefined();
      expect(call[2].conversationKey).toBe(call[2].reqId);
    }
  });

  it('continues checking other enabled services if one fails', async () => {
    const runtime = new CliRuntimeManager();
    const execute = vi.spyOn(runtime, 'execute')
      .mockRejectedValueOnce(new Error('not signed in'))
      .mockResolvedValueOnce({ text: 'Transgentic connection ready.' });
    await expect(runtime.testEnabledConnections(['cli_codex', 'cli_grok'])).resolves.toBeUndefined();
    expect(execute).toHaveBeenCalledTimes(2);
  });
});
