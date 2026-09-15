import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BUILTIN_RECIPES, validateCustomRecipe } from '../src/shared/types/recipe.js';
import { logCategory } from '../src/main/storage/logStorage.js';
import { DEFAULT_TEMPORARY_CHAT, isTemporaryChatPreferred, normalizeTemporaryChatConfig } from '../src/shared/types.js';
import { DataBlindingEngine } from '../src/main/security/dataBlinding.js';
import { globalMemoryDb } from '../src/main/storage/memoryDb.js';
import { ThreadManager } from '../src/main/registry/threadManager.js';
import { CustomRecipeAdapter } from '../src/main/webviews/customRecipeAdapter.js';

describe('Temporary Chat contracts', () => {
  it('keeps old recipes valid and treats only declared built-ins as supported', () => {
    const oldRecipe = structuredClone(BUILTIN_RECIPES.grok) as any;
    delete oldRecipe.temporaryChat;
    expect(validateCustomRecipe(oldRecipe).valid).toBe(true);

    for (const id of ['chatgpt', 'claude', 'gemini'] as const) {
      const recipe = BUILTIN_RECIPES[id];
      expect(recipe.temporaryChat?.enabled).toBe(true);
      expect(recipe.temporaryChat?.activationSteps?.length).toBeGreaterThan(0);
      expect(recipe.temporaryChat?.activeWhen).toBeDefined();
      expect(recipe.temporaryChat?.inactiveWhen).toBeDefined();
    }
    expect(BUILTIN_RECIPES.grok.temporaryChat).toBeUndefined();
  });

  it('normalizes semantic activation locators and rejects unverifiable declarations', () => {
    const valid = structuredClone(BUILTIN_RECIPES.grok) as any;
    valid.temporaryChat = {
      enabled: true,
      activationSteps: [{ action: 'click', target: { role: 'BUTTON', name: [' Temporary Chat ', 'Temporary Chat'] } }],
      activeWhen: { role: 'HEADING', name: ' Temporary Chat ', nameMatch: 'contains' },
      inactiveWhen: { role: 'button', name: ' Temporary Chat ' },
    };
    const result = validateCustomRecipe(valid);
    expect(result.valid).toBe(true);
    expect(result.recipe?.temporaryChat?.activationSteps?.[0].target).toEqual({ role: 'button', name: 'Temporary Chat' });
    expect(result.recipe?.temporaryChat?.activeWhen).toEqual({ role: 'heading', name: 'Temporary Chat', nameMatch: 'contains' });

    const invalid = structuredClone(valid);
    delete invalid.temporaryChat.activeWhen;
    expect(validateCustomRecipe(invalid).errors).toContain('temporaryChat.activeWhen requires selectors or role.');

    invalid.temporaryChat.activeWhen = { selectors: '[aria-pressed="true"]' };
    invalid.temporaryChat.activationSteps = [{ action: 'navigate', target: { selectors: 'a' } }];
    expect(validateCustomRecipe(invalid).errors).toContain('temporaryChat.activationSteps[0] requires a click action and a valid target.');
  });

  it('retains temporary transcript fields while categorizing by requested policy', () => {
    const log = {
      id: 'temporary-log', timestamp: Date.now(), mode: 'general', targetProvider: 'chatgpt', status: 'failed',
      temporaryChat: true, maskedSecretsCount: 1, promptText: 'sentinel prompt', promptSnippet: 'sentinel',
      responseText: 'sentinel answer', responseSnippet: 'answer', error: '[TEMPORARY_CHAT_VERIFICATION_FAILED] raw provider page text',
      mediaPath: '/Library/Images/private-result.png',
      attachments: [{ name: 'secret-filename.pdf', mimeType: 'application/pdf', size: 1, sha256: 'abc' }],
    } as any;
    expect(log.promptText).toBe('sentinel prompt');
    expect(log.responseText).toBe('sentinel answer');
    expect(log.attachments?.[0].name).toBe('secret-filename.pdf');
    expect(logCategory(log)).toBe('temporary');
    expect(logCategory({ ...log, chatExecution: { policy: 'normal', actualMode: 'normal', verified: false } })).toBe('normal');
  });

  it('defaults General, Writing, and Coding on and media modes off without provider preferences', () => {
    expect(DEFAULT_TEMPORARY_CHAT).toEqual({ general: true, coding: true, image: false, video: false, music: false });
    expect(isTemporaryChatPreferred(undefined, 'writing')).toBe(true);
    expect(isTemporaryChatPreferred({ temporaryChat: { ...DEFAULT_TEMPORARY_CHAT, general: false } }, 'general')).toBe(false);
    expect(isTemporaryChatPreferred(undefined, 'image')).toBe(false);
    expect(normalizeTemporaryChatConfig({ general: false, image: true })).toEqual({ general: false, coding: true, image: true, video: false, music: false });
  });

  it('keeps temporary blinding tokens out of the durable vault', () => {
    const engine = new DataBlindingEngine();
    engine.clearVault();
    const insert = vi.spyOn(globalMemoryDb, 'insertSecret');
    const contextId = engine.createRequestContext();
    const result = engine.blind('Use sk-live-123456789012345678901234 and q2w3e4r5t6y7u8i9o0p1a2s3d4f5g6h7', contextId, { persist: false });
    expect(result.replacementsCount).toBeGreaterThan(0);
    expect(insert).not.toHaveBeenCalled();
    engine.purgeRequestContext(contextId);
    expect(engine.getTokens()).toHaveLength(0);
    insert.mockRestore();
  });

  it('drops temporary transcript history when its owning view ends', () => {
    const threads = new ThreadManager();
    threads.setSession('thread', 'chatgpt', '', undefined, {
      chatMode: 'temporary', temporaryState: 'verified', temporarySessionKey: 'temp-key',
    });
    threads.setSession('other-thread', 'chatgpt', '', undefined, {
      chatMode: 'temporary', temporaryState: 'verified', temporarySessionKey: 'other-temp-key',
    });
    threads.recordTurn('thread', 'chatgpt', 'sentinel prompt', 'sentinel answer');
    threads.recordTurn('other-thread', 'chatgpt', 'other prompt', 'other answer');
    expect(threads.getHistory('thread', 'chatgpt')).toHaveLength(2);
    expect(threads.removeTemporarySessionByKey('temp-key')).toBe(1);
    expect(threads.getSession('thread', 'chatgpt')).toBeNull();
    expect(threads.getSession('other-thread', 'chatgpt')?.temporarySessionKey).toBe('other-temp-key');
    expect(threads.getHistory('other-thread', 'chatgpt')).toHaveLength(2);
  });

  it('runs reveal and activation steps before accepting positive provider state', async () => {
    const adapter = new CustomRecipeAdapter(BUILTIN_RECIPES.gemini);
    const loadURL = vi.fn().mockResolvedValue(undefined);
    adapter.setWebContents({ isDestroyed: () => false, isLoading: () => false, loadURL } as any);
    vi.spyOn(adapter, 'checkAuthStatus').mockResolvedValue(true);
    vi.spyOn(adapter, 'verifyTemporaryChat').mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    vi.spyOn(adapter as any, 'locatorExists').mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    const click = vi.spyOn(adapter as any, 'executeClickStep').mockResolvedValue(undefined);

    await adapter.activateTemporaryChat();

    expect(loadURL).toHaveBeenCalledWith(BUILTIN_RECIPES.gemini.newChatUrl);
    expect(click.mock.calls.map(([step]) => step.target.name)).toEqual(['Temporary chat']);
  });

  it('does not enter content when temporary state cannot be verified', async () => {
    const adapter = new CustomRecipeAdapter(BUILTIN_RECIPES.chatgpt);
    adapter.setWebContents({ isDestroyed: () => false, getURL: () => BUILTIN_RECIPES.chatgpt.url } as any);
    adapter.setTemporaryChatRequired(true);
    vi.spyOn(adapter, 'verifyTemporaryChat').mockResolvedValue(false);
    const input = vi.spyOn(adapter, 'dispatchRealisticInput');

    await expect(adapter.executePrompt('sentinel', 'general')).rejects.toThrow('[TEMPORARY_CHAT_ENDED]');
    expect(input).not.toHaveBeenCalled();
  });
});
