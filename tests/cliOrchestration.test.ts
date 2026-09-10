import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TransgenticMcpServer } from '../src/main/mcp/server.js';
import { globalCliRuntime } from '../src/main/cli/cliRuntimeManager.js';
import { DynamicRouter } from '../src/main/mcp/router.js';
import { ModelRegistryManager } from '../src/main/registry/modelRegistry.js';
import { ServiceManifestManager } from '../src/main/registry/serviceManifest.js';
import { globalSessionManager } from '../src/main/webviews/sessionManager.js';
import { globalThreadManager } from '../src/main/registry/threadManager.js';
import { globalRateLimiter } from '../src/main/mcp/rateLimiter.js';
import { DuplicateActionGuard } from '../src/main/security/duplicateActionGuard.js';
import type { TransgenticConfig } from '../src/shared/types.js';
vi.mock('../src/main/storage/logStorage.js', () => ({ globalLogStorage: { insert: vi.fn(), update: vi.fn() } }));
let server: TransgenticMcpServer;
beforeEach(() => {
  globalThreadManager.clearAll(); DuplicateActionGuard.clear();
  vi.spyOn(globalCliRuntime, 'available').mockReturnValue(true);
  vi.spyOn(globalCliRuntime, 'getServiceConfig').mockReturnValue({ ...({} as any), workMode: 'agentic', allowCommands: false, allowProjectEditing: false, timeoutSeconds: 300 });
  vi.spyOn(globalCliRuntime, 'execute').mockResolvedValue({ text: 'CLI answer', sessionId: 'native' });
  vi.spyOn(ServiceManifestManager, 'isServiceEnabled').mockReturnValue(true);
  vi.spyOn(ModelRegistryManager, 'getProviderConfig').mockReturnValue({ serviceEnabled: true } as any);
  vi.spyOn(DynamicRouter, 'getCandidateChain').mockReturnValue(['cli_codex']);
  vi.spyOn(DynamicRouter, 'resolveTargetModel').mockReturnValue(undefined);
  vi.spyOn(globalRateLimiter, 'isRateLimited').mockReturnValue(false);
  vi.spyOn(globalRateLimiter, 'recordRequest').mockImplementation(() => {});
  vi.spyOn(globalRateLimiter, 'markSuccess').mockImplementation(() => {});
  vi.spyOn(globalSessionManager, 'ensureWebContents');
  server = new TransgenticMcpServer();
  server.updateConfig({ balancedMode: false, doubleAgent: { enabled: false } } as TransgenticConfig);
});
afterEach(() => { globalThreadManager.clearAll(); DuplicateActionGuard.clear(); vi.restoreAllMocks(); });
describe('CLI integration with existing orchestration', () => {
  it('routes explicit models and workspace restrictions without creating a webview', async () => {
    const result = await server.orchestratePrompt('Hello', 'general', 'cli_codex', undefined, 'native-model', undefined, 'caller-thread', true, false, true,
      { profile: 'plain', sessionId: 'caller-a', cliRequest: { workspaceId: 'registered', allowCommands: false } });
    expect(result.isError).not.toBe(true);
    expect(result.content[0].text).toBe('CLI answer');
    expect(globalCliRuntime.execute).toHaveBeenCalledWith('cli_codex', expect.any(String), expect.objectContaining({ model: 'native-model', request: { workspaceId: 'registered', allowCommands: false }, desktop: false, reviewer: false }));
    expect(globalSessionManager.ensureWebContents).not.toHaveBeenCalled();
  });
  it('does not replay on another provider after a possibly mutating failure', async () => {
    vi.mocked(DynamicRouter.getCandidateChain).mockReturnValue(['cli_codex', 'cli_grok']);
    vi.mocked(globalCliRuntime.execute).mockRejectedValue(Object.assign(new Error('project operation failed'), { noFallback: true }));
    const result = await server.orchestratePrompt('Edit file', 'coding', undefined, undefined, undefined, undefined, 'failed-workspace', true, false, true);
    expect(result.isError).toBe(true); expect(globalCliRuntime.execute).toHaveBeenCalledTimes(1);
  });
  it.each([true, false])('uses route workspace settings for desktop=%s without a CLI-specific request', async desktop => {
    vi.spyOn(DynamicRouter, 'getRule').mockReturnValue({ defaultService: 'cli_codex', fallbackChain: [], cliWorkspaces: { cli_codex: 'host-project' } });
    const result = await server.orchestratePrompt('Review code', 'coding', undefined, undefined, undefined, undefined, 'route-workspace', true, desktop, true, { profile: 'plain', sessionId: 'client' });
    expect(result.isError).not.toBe(true);
    expect(globalCliRuntime.execute).toHaveBeenCalledWith('cli_codex', expect.any(String), expect.objectContaining({ request: { workspaceId: 'host-project' }, desktop }));
  });
  it('keeps request restrictions when using the route workspace', async () => {
    vi.spyOn(DynamicRouter, 'getRule').mockReturnValue({ defaultService: 'cli_codex', fallbackChain: [], cliWorkspaces: { cli_codex: 'host-project' } });
    await server.orchestratePrompt('Review code', 'coding', undefined, undefined, undefined, undefined, 'restriction', true, false, true, { profile: 'plain', sessionId: 'client', cliRequest: { allowCommands: false, allowProjectEditing: false } });
    expect(globalCliRuntime.execute).toHaveBeenCalledWith('cli_codex', expect.any(String), expect.objectContaining({ request: { workspaceId: 'host-project', allowCommands: false, allowProjectEditing: false } }));
  });
  it('ignores a stale route workspace in Provider Mode', async () => {
    vi.mocked(globalCliRuntime.getServiceConfig).mockReturnValue({ workMode: 'provider', allowCommands: false, allowProjectEditing: false, timeoutSeconds: 300 });
    vi.spyOn(DynamicRouter, 'getRule').mockReturnValue({ defaultService: 'cli_codex', fallbackChain: [], cliWorkspaces: { cli_codex: 'host-project' } });
    await server.orchestratePrompt('Answer from this prompt', 'general', undefined, undefined, undefined, undefined, 'provider-mode', true, false, true, { profile: 'plain', sessionId: 'client' });
    expect(globalCliRuntime.execute).toHaveBeenCalledWith('cli_codex', expect.any(String), expect.objectContaining({ request: {} }));
  });
  it('does not fall back to a context-free service when a route workspace is unavailable', async () => {
    vi.spyOn(DynamicRouter, 'getRule').mockReturnValue({ defaultService: 'cli_codex', fallbackChain: ['cli_grok'], cliWorkspaces: { cli_codex: 'removed-project' } });
    vi.mocked(DynamicRouter.getCandidateChain).mockReturnValue(['cli_codex', 'cli_grok']);
    vi.mocked(globalCliRuntime.execute).mockRejectedValue(new Error('Workspace is unavailable'));
    const result = await server.orchestratePrompt('Review code', 'coding', undefined, undefined, undefined, undefined, 'missing-project', true, false, true);
    expect(result.isError).toBe(true);
    expect(globalCliRuntime.execute).toHaveBeenCalledTimes(1);
  });
  it('rejects media mode before spawning the CLI', async () => {
    const result = await server.orchestratePrompt('Draw a cat', 'image', 'cli_codex', undefined, undefined, undefined, 'media', true);
    expect(result.isError).toBe(true); expect(globalCliRuntime.execute).not.toHaveBeenCalled();
  });
});
