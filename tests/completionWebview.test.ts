import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CompletionGateway } from '../src/main/completion/completionGateway.js';
import { BUILTIN_RECIPES } from '../src/shared/types/recipe.js';
import { DEFAULT_TEMPORARY_CHAT } from '../src/shared/types.js';
import { ServiceManifestManager } from '../src/main/registry/serviceManifest.js';
import { AccountRegistryManager } from '../src/main/registry/accountRegistry.js';
import { globalSessionManager } from '../src/main/webviews/sessionManager.js';
import { CustomRecipeAdapter } from '../src/main/webviews/customRecipeAdapter.js';
import { DynamicRouter } from '../src/main/mcp/router.js';

vi.mock('electron', () => ({ app: undefined }));

describe('WebView completion conversation ownership', () => {
  const executePrompt = vi.fn().mockResolvedValue({ text: 'Provider answer' });
  const handle = { adapter: { acquireDomLock: vi.fn().mockResolvedValue(() => {}), executePrompt }, webContents: { isDestroyed: () => false } } as any;
  let gateway: CompletionGateway;

  beforeEach(() => {
    executePrompt.mockReset().mockResolvedValue({ text: 'Provider answer' });
    handle.adapter.acquireDomLock.mockReset().mockResolvedValue(() => {});
    vi.spyOn(ServiceManifestManager, 'getManifest').mockReturnValue({ version: '1', services: {
      grok: { id: 'grok', name: 'Grok', enabled: true, providerType: 'webview', url: 'https://grok.com' },
      chatgpt: { id: 'chatgpt', name: 'ChatGPT', enabled: true, providerType: 'webview', url: 'https://chatgpt.com' },
    } } as any);
    vi.spyOn(globalSessionManager, 'getAdapter').mockImplementation(id => new CustomRecipeAdapter(BUILTIN_RECIPES[id as 'grok' | 'chatgpt']));
    vi.spyOn(globalSessionManager, 'getStatus').mockImplementation(id => ({ temporaryChat: id === 'chatgpt'
      ? { supported: true, availability: 'available' } : { supported: false, availability: 'unavailable' } }) as any);
    vi.spyOn(globalSessionManager, 'ensureNormalConversation').mockResolvedValue(handle);
    vi.spyOn(globalSessionManager, 'ensureTemporaryConversation').mockResolvedValue(handle);
    vi.spyOn(globalSessionManager, 'endTemporaryConversation').mockReturnValue(true);
    vi.spyOn(AccountRegistryManager, 'getActiveAccount').mockReturnValue({ id: 'account', partitionKey: 'persist:account', status: 'ready' } as any);
    vi.spyOn(DynamicRouter, 'resolveTargetModel').mockReturnValue(undefined);
    gateway = new CompletionGateway(() => ({ temporaryChat: { ...DEFAULT_TEMPORARY_CHAT } } as any), () => 58420);
  });
  afterEach(() => { vi.restoreAllMocks(); });

  it('uses a fresh view and full caller history for every ordinary API request', async () => {
    expect(gateway.isEligible('grok')).toBe(true);
    expect(gateway.isEligible('chatgpt')).toBe(true);
    const first = await gateway.complete({ model: 'transgentic/provider/grok', messages: [{ role: 'user', content: 'First' }] });
    const second = await gateway.complete({ model: 'transgentic/provider/grok', messages: [{ role: 'user', content: 'First' }, { role: 'assistant', content: 'Provider answer' }, { role: 'user', content: 'Second' }] });
    expect(first.chatExecution).toMatchObject({ policy: 'prefer-temporary', actualMode: 'normal', fallbackReason: expect.any(String) });
    expect(second.message.content).toBe('Provider answer');
    const keys = vi.mocked(globalSessionManager.ensureNormalConversation).mock.calls.map(([params]) => params.key);
    expect(new Set(keys).size).toBe(2);
    expect(globalSessionManager.endTemporaryConversation).toHaveBeenCalledTimes(2);
    expect(executePrompt.mock.calls[1][0]).toContain('First');
    expect(executePrompt.mock.calls[1][0]).toContain('Second');
  });

  it('rejects strict temporary requests before opening an unsupported provider', async () => {
    await expect(gateway.complete({ model: 'transgentic/provider/grok', temporary_chat: true, messages: [{ role: 'user', content: 'sentinel' }] })).rejects.toThrow('TEMPORARY_CHAT_UNSUPPORTED');
    expect(globalSessionManager.ensureNormalConversation).not.toHaveBeenCalled();
    expect(executePrompt).not.toHaveBeenCalled();
  });

  it('opens native Temporary Chat before content entry and stops on activation failure', async () => {
    const result = await gateway.complete({ model: 'transgentic/provider/chatgpt', temporary_chat: true, messages: [{ role: 'user', content: 'sentinel' }] });
    expect(result.chatExecution).toMatchObject({ actualMode: 'temporary', verified: true });
    expect(globalSessionManager.ensureTemporaryConversation).toHaveBeenCalledOnce();
    vi.mocked(globalSessionManager.ensureTemporaryConversation).mockRejectedValueOnce(new Error('[TEMPORARY_CHAT_VERIFICATION_FAILED] UI changed'));
    await expect(gateway.complete({ model: 'transgentic/provider/chatgpt', temporary_chat: true, messages: [{ role: 'user', content: 'second sentinel' }] })).rejects.toThrow('VERIFICATION_FAILED');
    expect(executePrompt).toHaveBeenCalledTimes(1);
  });

  it('retains an explicit conversation ID and sends only new messages on continuation', async () => {
    await gateway.complete({ model: 'transgentic/provider/grok', conversation_id: 'client-thread', messages: [{ role: 'user', content: 'First' }] }, undefined, { principal: 'principal' });
    vi.spyOn(globalSessionManager, 'getManagedConversation').mockReturnValue(handle);
    const next = await gateway.complete({ model: 'transgentic/provider/grok', conversation_id: 'client-thread', messages: [{ role: 'user', content: 'Second' }] }, undefined, { principal: 'principal' });
    expect(next.conversationId).toBe('client-thread');
    expect(vi.mocked(globalSessionManager.ensureNormalConversation).mock.calls[1][0].forceNew).toBe(false);
    expect(executePrompt.mock.calls[1][0]).toContain('Second');
    expect(executePrompt.mock.calls[1][0]).not.toContain('First');
    expect(gateway.endConversation('client-thread', 'principal')).toBe(true);
  });

  it('reports ended retained views and allows an explicit fresh thread', async () => {
    await gateway.complete({ model: 'transgentic/provider/grok', conversation_id: 'ended-thread', messages: [{ role: 'user', content: 'First' }] }, undefined, { principal: 'principal' });
    vi.spyOn(globalSessionManager, 'getManagedConversation').mockReturnValue(undefined);
    await expect(gateway.complete({ model: 'transgentic/provider/grok', conversation_id: 'ended-thread', messages: [{ role: 'user', content: 'Second' }] }, undefined, { principal: 'principal' })).rejects.toThrow('CONVERSATION_ENDED');
    const fresh = await gateway.complete({ model: 'transgentic/provider/grok', conversation_id: 'ended-thread', new_thread: true, messages: [{ role: 'user', content: 'Start over' }] }, undefined, { principal: 'principal' });
    expect(fresh.message.content).toBe('Provider answer');
    expect(vi.mocked(globalSessionManager.ensureNormalConversation).mock.calls.at(-1)?.[0].forceNew).toBe(true);
  });

  it('resets a retained browser conversation when its mode setting changes', async () => {
    let preferred = true;
    gateway = new CompletionGateway(() => ({ temporaryChat: { ...DEFAULT_TEMPORARY_CHAT, general: preferred } } as any), () => 58420);
    await gateway.complete({ model: 'transgentic/provider/chatgpt', conversation_id: 'mode-thread', messages: [{ role: 'user', content: 'First' }] }, undefined, { principal: 'principal' });
    vi.spyOn(globalSessionManager, 'getManagedConversation').mockReturnValue(handle);
    preferred = false;
    const next = await gateway.complete({ model: 'transgentic/provider/chatgpt', conversation_id: 'mode-thread', messages: [{ role: 'user', content: 'Second' }] }, undefined, { principal: 'principal' });
    expect(next.contextReset).toBe(true);
    expect(next.chatExecution).toMatchObject({ policy: 'normal', actualMode: 'normal' });
    expect(vi.mocked(globalSessionManager.ensureNormalConversation).mock.calls.at(-1)?.[0].forceNew).toBe(true);
    expect(globalSessionManager.endTemporaryConversation).toHaveBeenCalledWith(expect.stringContaining('mode-thread'));
  });

  it('keeps another live conversation when the preference changes during an active request', async () => {
    let preferred = true;
    gateway = new CompletionGateway(() => ({ temporaryChat: { ...DEFAULT_TEMPORARY_CHAT, general: preferred } } as any), () => 58420);
    let entered!: () => void;
    let finishFirst!: () => void;
    const firstEntered = new Promise<void>(resolve => { entered = resolve; });
    executePrompt.mockImplementationOnce(() => {
      entered();
      return new Promise(resolve => { finishFirst = () => resolve({ text: 'First answer' }); });
    });

    const first = gateway.complete({ model: 'transgentic/provider/chatgpt', conversation_id: 'agent-one', messages: [{ role: 'user', content: 'First' }] }, undefined, { principal: 'principal' });
    await firstEntered;
    preferred = false;
    const second = gateway.complete({ model: 'transgentic/provider/chatgpt', conversation_id: 'agent-two', messages: [{ role: 'user', content: 'Second' }] }, undefined, { principal: 'principal' });
    expect(globalSessionManager.endTemporaryConversation).not.toHaveBeenCalled();
    finishFirst();
    const [firstResult, secondResult] = await Promise.all([first, second]);
    expect(firstResult.chatExecution).toMatchObject({ policy: 'prefer-temporary', actualMode: 'temporary' });
    expect(secondResult.chatExecution).toMatchObject({ policy: 'normal', actualMode: 'normal' });
    expect(vi.mocked(globalSessionManager.ensureTemporaryConversation).mock.calls[0][0].key).toContain('agent-one');
    expect(vi.mocked(globalSessionManager.ensureNormalConversation).mock.calls[0][0].key).toContain('agent-two');
    expect(globalSessionManager.endTemporaryConversation).not.toHaveBeenCalled();
  });

  it('waits for the active turn before resetting the same conversation and keeps its queued policy', async () => {
    let preferred = true;
    gateway = new CompletionGateway(() => ({ temporaryChat: { ...DEFAULT_TEMPORARY_CHAT, general: preferred } } as any), () => 58420);
    let entered!: () => void;
    let finishFirst!: () => void;
    const firstEntered = new Promise<void>(resolve => { entered = resolve; });
    executePrompt.mockImplementationOnce(() => {
      entered();
      return new Promise(resolve => { finishFirst = () => resolve({ text: 'First answer' }); });
    });

    const first = gateway.complete({ model: 'transgentic/provider/chatgpt', conversation_id: 'same-agent', messages: [{ role: 'user', content: 'First' }] }, undefined, { principal: 'principal' });
    await firstEntered;
    vi.spyOn(globalSessionManager, 'getManagedConversation').mockReturnValue(handle);
    preferred = false;
    const second = gateway.complete({ model: 'transgentic/provider/chatgpt', conversation_id: 'same-agent', messages: [{ role: 'user', content: 'Second' }] }, undefined, { principal: 'principal' });
    preferred = true;
    expect(globalSessionManager.endTemporaryConversation).not.toHaveBeenCalled();
    finishFirst();
    const firstResult = await first;
    expect(firstResult.chatExecution?.actualMode).toBe('temporary');
    const secondResult = await second;
    expect(secondResult.chatExecution).toMatchObject({ policy: 'normal', actualMode: 'normal' });
    expect(secondResult.contextReset).toBe(true);
    expect(globalSessionManager.endTemporaryConversation).toHaveBeenCalledWith(expect.stringContaining('same-agent'));
  });

  it('does not resend after a response or tool envelope becomes uncertain', async () => {
    executePrompt.mockRejectedValueOnce(new Error('[WEBVIEW_SUBMISSION_UNCERTAIN] provider view lost'));
    await expect(gateway.complete({ model: 'transgentic/provider/grok', messages: [{ role: 'user', content: 'sentinel' }] })).rejects.toThrow('SUBMISSION_UNCERTAIN');
    expect(executePrompt).toHaveBeenCalledOnce();
  });
});
