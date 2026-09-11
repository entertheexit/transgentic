import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { validateCustomRecipe, BUILTIN_RECIPES, CustomRecipe } from '../src/shared/types/recipe.js';
import { RecipeManager } from '../src/main/registry/recipeManager.js';
import { ServiceManifestManager } from '../src/main/registry/serviceManifest.js';
import { createRecipeRouter } from '../src/main/auth/recipeSyncServer.js';
import { LocalLlmClient } from '../src/main/localllm/localLlmClient.js';
import { confirmRecipeInstallation } from '../src/main/registry/recipeConsent.js';

describe('Custom Recipe System Unit Tests', () => {
  const sampleValidRecipe = {
    version: '1.0',
    id: 'test_ai_portal',
    title: 'Test AI Portal',
    domainMatch: 'testai.internal',
    url: 'https://testai.internal/chat',
    selectors: {
      inputPrompt: '#prompt-input',
      submitButton: 'button[type="submit"]',
      stopButton: 'button.stop-btn',
    },
    authStrategy: 'cookie_sync',
    createdAt: '2026-09-01T00:00:00.000Z',
    response: {
      container: '.chat-turn-bot',
      textSelector: '.prose-markdown',
      modes: {
        text: { enabled: true, mediaKind: 'text' },
        image: { enabled: true, contentSelector: '.chat-turn-bot img.result', mediaKind: 'image' },
      },
    },
    models: [
      { id: 'model-turbo', displayName: 'Turbo v2', mode: 'general' },
      { id: 'model-code', displayName: 'Code Expert', mode: 'coding' },
    ],
  };

  describe('validateCustomRecipe Schema & Normalization', () => {
    it('should validate a complete valid recipe', () => {
      const result = validateCustomRecipe(sampleValidRecipe);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.recipe).toBeDefined();
      expect(result.recipe?.id).toBe('test_ai_portal');
      expect(result.recipe?.domainMatch).toBe('testai.internal');
      expect(result.recipe?.selectors.inputPrompt).toBe('#prompt-input');
      expect(result.recipe?.response.modes.image?.enabled).toBe(true);
    });

    it('should normalize legacy aliases: "name" to "title" and "domain" to "domainMatch"', () => {
      const aliased = {
        id: 'aliased_ai',
        name: 'Aliased Assistant',
        domain: 'aliased.org',
        selectors: {
          inputPrompt: 'textarea',
          submitButton: 'button.send',
        },
        response: {
          container: '.bot-message',
          modes: { text: { enabled: true } },
        },
      };

      const result = validateCustomRecipe(aliased);
      expect(result.valid).toBe(true);
      expect(result.recipe?.title).toBe('Aliased Assistant');
      expect(result.recipe?.domainMatch).toBe('aliased.org');
      expect(result.recipe?.version).toBe('1.0');
      expect(result.recipe?.authStrategy).toBe('cookie_sync');
      expect(result.recipe?.url).toBe('https://aliased.org');
    });

    it('should normalize flat/inspector response structures with mediaResult selectors', () => {
      const flatRecipe = {
        id: 'flat_ai',
        title: 'Flat AI',
        domainMatch: 'flat.ai',
        selectors: {
          inputPrompt: 'input[name="q"]',
          submitButton: 'button#go',
          responseContainer: '.turn-assistant',
          textResponse: '.markdown-body',
          imageResult: 'img.output',
          videoResult: 'video.stream',
          audioResult: 'audio.clip',
        },
      };

      const result = validateCustomRecipe(flatRecipe);
      expect(result.valid).toBe(true);
      expect(result.recipe?.response.container).toBe('.turn-assistant');
      expect(result.recipe?.response.textSelector).toBe('.markdown-body');
      expect(result.recipe?.response.modes.text.enabled).toBe(true);
      expect(result.recipe?.response.modes.image?.contentSelector).toBe('img.output');
      expect(result.recipe?.response.modes.video?.contentSelector).toBe('video.stream');
      expect(result.recipe?.response.modes.music?.contentSelector).toBe('audio.clip');
    });

    it('should migrate a legacy recipe Audio mode to Music and keep audio as its media kind', () => {
      const legacy = JSON.parse(JSON.stringify(sampleValidRecipe));
      delete legacy.modeSchemaVersion;
      legacy.response.modes.audio = { enabled: true, contentSelector: 'audio.track', mediaKind: 'audio' };
      legacy.models.push({ id: 'legacy-music', displayName: 'Legacy Music', mode: 'audio', modes: ['audio'] });

      const result = validateCustomRecipe(legacy);
      expect(result.valid).toBe(true);
      expect(result.recipe?.modeSchemaVersion).toBe(2);
      expect(result.recipe?.response.modes).not.toHaveProperty('audio');
      expect(result.recipe?.response.modes.music).toMatchObject({ contentSelector: 'audio.track', mediaKind: 'audio' });
      expect(result.recipe?.models.at(-1)).toMatchObject({ mode: 'music', modes: ['music'] });
    });

    it('should reject invalid payloads, missing required fields, or illegal characters', () => {
      // Non-object
      expect(validateCustomRecipe(null).valid).toBe(false);
      expect(validateCustomRecipe('string').valid).toBe(false);

      // Illegal ID (contains spaces or punctuation)
      expect(validateCustomRecipe({ ...sampleValidRecipe, id: 'invalid id with spaces' }).valid).toBe(false);
      expect(validateCustomRecipe({ ...sampleValidRecipe, id: 'invalid!@#$' }).valid).toBe(false);

      // Missing title
      expect(validateCustomRecipe({ ...sampleValidRecipe, title: '', name: undefined }).valid).toBe(false);

      // Missing domainMatch
      expect(validateCustomRecipe({ ...sampleValidRecipe, domainMatch: '', domain: undefined }).valid).toBe(false);

      // Missing selectors
      expect(validateCustomRecipe({ ...sampleValidRecipe, selectors: undefined }).valid).toBe(false);
      expect(validateCustomRecipe({ ...sampleValidRecipe, selectors: { inputPrompt: '' } }).valid).toBe(false);

      // Missing container
      const noContainer = JSON.parse(JSON.stringify(sampleValidRecipe));
      delete noContainer.response.container;
      expect(validateCustomRecipe(noContainer).valid).toBe(false);
    });

    it('should support multi-candidate fallback selector arrays and normalize them', () => {
      const multiFallbackRecipe = {
        id: 'multi_fallback_ai',
        title: 'Multi Fallback AI',
        domainMatch: 'multifallback.ai',
        selectors: {
          inputPrompt: ['#prompt-textarea', 'div[contenteditable="true"]', 'textarea[name="prompt"]'],
          submitButton: ['button[data-testid="send-button"]', 'button[aria-label="Send"]'],
          stopButton: ['button.stop-active', 'button[aria-label="Stop"]'],
        },
        response: {
          container: ['.message-assistant', '.bot-turn', 'article.chat-turn'],
          textSelector: ['.prose', '.markdown-body'],
          modes: {
            text: { enabled: true, mediaKind: 'text' },
          },
        },
      };

      const result = validateCustomRecipe(multiFallbackRecipe);
      expect(result.valid).toBe(true);
      expect(Array.isArray(result.recipe?.selectors.inputPrompt)).toBe(true);
      expect(result.recipe?.selectors.inputPrompt).toHaveLength(3);
      expect(Array.isArray(result.recipe?.selectors.submitButton)).toBe(true);
      expect(result.recipe?.selectors.submitButton).toHaveLength(2);
      expect(Array.isArray(result.recipe?.response.container)).toBe(true);
      expect(result.recipe?.response.container).toHaveLength(3);
    });

    it('normalizes semantic attachment reveal steps and preserves legacy triggers', () => {
      const recipe = structuredClone(sampleValidRecipe) as any;
      recipe.response.modes.text.inputAttachments = {
        fileInput: [' input[type="file"] ', 'input[data-upload]'],
        trigger: ' button.legacy-attach ',
        revealSteps: [
          { action: 'click', target: { selectors: [' button.attach ', 'button[aria-haspopup="menu"]'], role: 'BUTTON', name: [' Add attachment ', 'เพิ่มไฟล์', 'Add attachment'] } },
          { action: 'click', target: { role: 'menuitem', name: ' อัปโหลดไฟล์หรือรูป ' } },
        ],
        acceptedKinds: ['image', 'document'],
        multiple: true,
      };

      const result = validateCustomRecipe(recipe);
      expect(result.valid).toBe(true);
      expect(result.recipe?.response.modes.text.inputAttachments).toEqual({
        fileInput: ['input[type="file"]', 'input[data-upload]'],
        trigger: 'button.legacy-attach',
        revealSteps: [
          { action: 'click', target: { selectors: ['button.attach', 'button[aria-haspopup="menu"]'], role: 'button', name: ['Add attachment', 'เพิ่มไฟล์'] } },
          { action: 'click', target: { role: 'menuitem', name: 'อัปโหลดไฟล์หรือรูป' } },
        ],
        acceptedKinds: ['image', 'document'],
        multiple: true,
      });
    });

    it('rejects malformed attachment reveal actions and targets', () => {
      const invalidAction = structuredClone(sampleValidRecipe) as any;
      invalidAction.response.modes.text.inputAttachments = {
        fileInput: 'input[type="file"]',
        revealSteps: [{ action: 'navigate', target: { selectors: 'a' } }],
        acceptedKinds: ['image'],
      };
      expect(validateCustomRecipe(invalidAction).errors).toContain('response.modes.text.inputAttachments.revealSteps[0].action must be "click".');

      const missingTarget = structuredClone(sampleValidRecipe) as any;
      missingTarget.response.modes.text.inputAttachments = {
        fileInput: 'input[type="file"]',
        revealSteps: [{ action: 'click', target: { name: 'Upload' } }],
        acceptedKinds: ['image'],
      };
      expect(validateCustomRecipe(missingTarget).errors).toContain('response.modes.text.inputAttachments.revealSteps[0].target requires selectors or role.');
    });

    it('should support dedicated mode pageUrl and selector overrides (e.g. Grok Imagine)', () => {
      const studioRecipe = {
        id: 'studio_ai',
        title: 'Studio AI',
        domainMatch: 'studio.ai',
        selectors: {
          inputPrompt: '#chat-input',
          submitButton: '#chat-send',
        },
        response: {
          container: '.chat-message',
          modes: {
            text: { enabled: true, mediaKind: 'text' },
            image: {
              enabled: true,
              mediaKind: 'image',
              pageUrl: '/imagine',
              inputSelector: ['#imagine-prompt-input', 'textarea.studio-prompt'],
              submitSelector: 'button#generate-art',
              contentSelector: ['img.generated-artwork', '.studio-result img'],
            },
          },
        },
      };

      const result = validateCustomRecipe(studioRecipe);
      expect(result.valid).toBe(true);
      expect(result.recipe?.response.modes.image?.pageUrl).toBe('/imagine');
      expect(result.recipe?.response.modes.image?.inputSelector).toEqual(['#imagine-prompt-input', 'textarea.studio-prompt']);
      expect(result.recipe?.response.modes.image?.submitSelector).toBe('button#generate-art');
      expect(result.recipe?.response.modes.image?.contentSelector).toEqual(['img.generated-artwork', '.studio-result img']);
    });

    it('should correctly format combined CSS selectors with toCombinedCssSelector and normalizeSelectorList', async () => {
      const { toCombinedCssSelector, normalizeSelectorList } = await import('../src/shared/types/recipe.js');
      expect(normalizeSelectorList([' #prompt ', '', 'textarea '])).toEqual(['#prompt', 'textarea']);
      expect(normalizeSelectorList('#single-selector')).toEqual(['#single-selector']);
      expect(normalizeSelectorList(null)).toEqual([]);

      expect(toCombinedCssSelector(['#a', '#b', 'button.c'])).toBe('#a, #b, button.c');
      expect(toCombinedCssSelector('#single')).toBe('#single');
      expect(toCombinedCssSelector(undefined)).toBe('');
    });

    it('should validate all BUILTIN_RECIPES (ChatGPT, Claude, Gemini, Grok)', () => {
      const builtins = [
        BUILTIN_RECIPES.chatgpt,
        BUILTIN_RECIPES.claude,
        BUILTIN_RECIPES.gemini,
        BUILTIN_RECIPES.grok,
      ];

      for (const recipe of builtins) {
        expect(recipe).toBeDefined();
        const result = validateCustomRecipe(recipe);
        expect(result.valid).toBe(true);
        expect(result.errors).toHaveLength(0);
        expect(result.recipe?.selectors.inputPrompt).toBeDefined();
        expect(result.recipe?.selectors.submitButton).toBeDefined();
        expect(result.recipe?.response.container).toBeDefined();
      }
    });

    it('should validate and normalize preconfig manifest JSON', () => {
      const manifest = {
        id: 'webview_custom_example',
        name: 'Custom Web Provider',
        domain: 'custom-provider.example.com',
        url: 'https://custom-provider.example.com/chat',
        selectors: {
          inputPrompt: 'textarea',
          submitButton: 'button[type="submit"]',
          responseContainer: '.response-turn',
          textResponse: '.markdown-body'
        },
        models: [{ id: 'default', name: 'Default Model' }]
      };
      const result = validateCustomRecipe(manifest);
      expect(result.valid).toBe(true);
      expect(result.recipe?.id).toBe(manifest.id);
      expect(result.recipe?.title).toBe(manifest.name);
      expect(result.recipe?.selectors.inputPrompt).toBeDefined();
      expect(result.recipe?.selectors.submitButton).toBeDefined();
      expect(result.recipe?.response.container).toBeDefined();
      expect(result.recipe?.response.textSelector).toBeDefined();
      expect(result.recipe?.response.container).not.toBe('main');
      expect(result.recipe?.response.textSelector).not.toBe('p');
      expect(result.recipe?.models?.length).toBeGreaterThan(0);
    });

    it('should filter out Thai and English disclaimer patterns with cleanModelOutput', async () => {
      const { cleanModelOutput } = await import('../src/main/webviews/adapterBase.js');
      expect(cleanModelOutput('AI อาจผิดพลาดได้ หลีกเลี่ยงการใส่ข้อมูลส่วนตัวหรือความลับ')).toBe('');
      expect(cleanModelOutput('AI อาจผิดพลาดได้ หลีกเลี่ยงการใส่ข้อมูลส่วนตัวหรือความลับ\nสวัสดีครับ ยินดีที่ได้คุยกับคุณ')).toBe('สวัสดีครับ ยินดีที่ได้คุยกับคุณ');
      expect(cleanModelOutput('AI may make mistakes')).toBe('');
    });

    it('should validate declarative auth and rate limit schemas for built-in recipes', async () => {
      const { CustomRecipeAdapter } = await import('../src/main/webviews/customRecipeAdapter.js');

      for (const key of ['chatgpt', 'claude', 'gemini', 'grok'] as const) {
        const recipe = BUILTIN_RECIPES[key];
        expect(recipe.auth).toBeDefined();
        expect(recipe.auth?.authCookies?.length).toBeGreaterThan(0);
        expect(recipe.auth?.loggedInSelector).toBeDefined();
        expect(recipe.newChatUrl).toBeDefined();

        // Ensure CustomRecipeAdapter handles built-in IDs cleanly without 'custom_' prefix
        const adapter = new CustomRecipeAdapter(recipe);
        expect(adapter.providerId).toBe(key);
        expect(adapter.partition).toBe(`persist:transgentic_${key}`);
      }
    });

    it('should validate the neutral example recipe custom-chat.recipe.json', () => {
      const examplePath = path.join(process.cwd(), 'recipes', 'examples', 'custom-chat.recipe.json');
      expect(fs.existsSync(examplePath)).toBe(true);

      const raw = JSON.parse(fs.readFileSync(examplePath, 'utf8'));
      const result = validateCustomRecipe(raw);
      expect(result.valid).toBe(true);
      expect(result.recipe?.auth).toBeDefined();
      expect(result.recipe?.auth?.authCookies).toContain('session_token');

      // Verify no sensitive terms leaked into the public example
      const fileText = fs.readFileSync(examplePath, 'utf8').toLowerCase();
      const forbidden = ['private-provider.example', 'private-session-value'];
      for (const term of forbidden) {
        expect(fileText).not.toContain(term);
      }
    });
  });

  describe('RecipeManager Instance & CRUD Operations', () => {
    let recipeManager: RecipeManager;
    let storageFile: string;

    beforeEach(() => {
      ServiceManifestManager.loadManifest();
      recipeManager = RecipeManager.getInstance();
      storageFile = recipeManager.getStoragePath();
      if (fs.existsSync(storageFile)) {
        fs.unlinkSync(storageFile);
      }
      recipeManager.loadPersistedRecipes();
    });

    afterEach(() => {
      if (fs.existsSync(storageFile)) {
        try { fs.unlinkSync(storageFile); } catch {}
      }
    });

    it('should return singleton instance', () => {
      const instanceA = RecipeManager.getInstance();
      const instanceB = RecipeManager.getInstance();
      expect(instanceA).toBe(instanceB);
    });

    it('should retrieve built-in recipes by id with or without prefix', () => {
      expect(recipeManager.getRecipe('chatgpt')).toBeDefined();
      expect(recipeManager.getRecipe('custom_chatgpt')).toBeDefined();
      expect(recipeManager.getRecipe('claude')?.domainMatch).toBe('claude.ai');
      expect(recipeManager.getRecipe('gemini')?.title).toBe('Google Gemini');
      expect(recipeManager.getRecipe('grok')?.title).toBe('xAI Grok');
      expect(recipeManager.getRecipe('non_existent_recipe_xyz')).toBeUndefined();
    });

    it('should install a valid custom recipe and synchronize with ServiceManifest', async () => {
      const installResult = await recipeManager.installRecipe(sampleValidRecipe);
      expect(installResult.success).toBe(true);
      expect(installResult.providerId).toBe('custom_test_ai_portal');
      expect(installResult.recipe.id).toBe('test_ai_portal');

      // Verify custom recipes collection
      const list = recipeManager.getCustomRecipes();
      expect(list.some(r => r.id === 'test_ai_portal')).toBe(true);

      // Verify getRecipe finds it
      const found = recipeManager.getRecipe('test_ai_portal');
      expect(found).toBeDefined();
      expect(found?.title).toBe('Test AI Portal');

      // Also accessible with custom_ prefix
      const foundWithPrefix = recipeManager.getRecipe('custom_test_ai_portal');
      expect(foundWithPrefix).toBeDefined();

      // Verify registered in ServiceManifest
      const manifest = ServiceManifestManager.getManifest();
      const service = manifest.services['custom_test_ai_portal'];
      expect(service).toBeDefined();
      expect(service.name).toBe('Test AI Portal');
      expect(service.providerType).toBe('webview');
      expect(service.url).toBe('https://testai.internal/chat');
      expect(service.models).toHaveLength(2);
      expect(service.models[0].id).toBe('model-turbo');

      // Verify persistence file was written
      expect(fs.existsSync(storageFile)).toBe(true);
      const fileContent = JSON.parse(fs.readFileSync(storageFile, 'utf-8'));
      expect(Array.isArray(fileContent)).toBe(true);
      expect(fileContent.some((r: any) => r.id === 'test_ai_portal')).toBe(true);
    });

    it('should throw when attempting to install an invalid recipe', async () => {
      await expect(recipeManager.installRecipe({ id: 'bad' })).rejects.toThrow(/Invalid Recipe JSON/);
    });

    it('cancels installation before registration even when imported consent is present', async () => {
      vi.mocked(confirmRecipeInstallation).mockRejectedValueOnce(new Error('Recipe installation cancelled.'));
      const raw = { ...sampleValidRecipe, id: 'cancelled_example', disclaimerAcceptance: {
        version: '1', text: 'Imported acceptance', acceptedAt: new Date().toISOString(),
      } };
      await expect(recipeManager.installRecipe(raw)).rejects.toThrow('cancelled');
      expect(recipeManager.getRecipe('cancelled_example')).toBeUndefined();
      expect(ServiceManifestManager.getManifest().services['custom_cancelled_example']).toBeUndefined();
      expect(vi.mocked(confirmRecipeInstallation).mock.lastCall?.[0].disclaimerAcceptance).toBeUndefined();
    });

    it('should delete an installed custom recipe and remove from ServiceManifest', async () => {
      await recipeManager.installRecipe(sampleValidRecipe);
      expect(recipeManager.getRecipe('test_ai_portal')).toBeDefined();

      // Delete recipe
      const deleted = recipeManager.deleteRecipe('test_ai_portal');
      expect(deleted).toBe(true);
      expect(recipeManager.getRecipe('test_ai_portal')).toBeUndefined();

      // Manifest entry should be removed
      const manifest = ServiceManifestManager.getManifest();
      expect(manifest.services['custom_test_ai_portal']).toBeUndefined();

      // Deleting non-existent returns false
      expect(recipeManager.deleteRecipe('test_ai_portal')).toBe(false);
    });

    it('should detect selectors using Local LLM when completion returns valid JSON', async () => {
      const mockLlmResponse = JSON.stringify({
        version: '1.0',
        id: 'detected_portal',
        title: 'Detected Portal',
        domainMatch: 'detected.ai',
        url: 'https://detected.ai',
        authStrategy: 'cookie_sync',
        selectors: {
          inputPrompt: 'div[contenteditable="true"]',
          submitButton: 'button[aria-label="Send"]',
        },
        response: {
          container: 'div[data-message-author="assistant"]',
          modes: { text: { enabled: true } },
        },
      });

      vi.spyOn(LocalLlmClient, 'generateCompletion').mockResolvedValueOnce({
        text: `Here is the deduced recipe:\n\`\`\`json\n${mockLlmResponse}\n\`\`\``,
        model: 'qwen2.5-coder:7b',
        durationMs: 120,
      });

      const deduced = await recipeManager.detectSelectorsWithLocalLlm(
        '<div contenteditable="true"></div><button aria-label="Send">Send</button>',
        'https://detected.ai'
      );

      expect(deduced).toBeDefined();
      expect(deduced.id).toBe('detected_portal');
      expect(deduced.selectors.inputPrompt).toBe('div[contenteditable="true"]');
      expect(deduced.selectors.submitButton).toBe('button[aria-label="Send"]');
    });
  });

  describe('createRecipeRouter Express Endpoints', () => {
    const router = createRecipeRouter();

    // Helper to find express route handler
    const getRouteHandler = (method: string, path: string) => {
      const routeLayer = (router as any).stack.find(
        (layer: any) => layer.route && layer.route.path === path && layer.route.methods[method.toLowerCase()]
      );
      if (!routeLayer) {
        throw new Error(`Route handler not found for ${method.toUpperCase()} ${path}`);
      }
      return routeLayer.route.stack[0].handle;
    };

    it('should handle GET / to retrieve custom recipes', async () => {
      const handler = getRouteHandler('GET', '/');
      const req: any = {};
      let responseData: any = null;

      const res: any = {
        setHeader: vi.fn(),
        status: vi.fn().mockReturnThis(),
        json: vi.fn((data: any) => {
          responseData = data;
          return res;
        }),
      };

      await handler(req, res);
      expect(res.setHeader).toHaveBeenCalledWith('Access-Control-Allow-Origin', '*');
      expect(responseData).toBeDefined();
      expect(responseData.success).toBe(true);
      expect(Array.isArray(responseData.recipes)).toBe(true);
    });

    it('should handle POST /install-and-sync with valid and invalid payloads', async () => {
      const handler = getRouteHandler('POST', '/install-and-sync');

      // 1. Missing recipe payload returns 400
      let errorStatus = 200;
      let errorData: any = null;
      const invalidRes: any = {
        setHeader: vi.fn(),
        status: vi.fn((code: number) => {
          errorStatus = code;
          return invalidRes;
        }),
        json: vi.fn((data: any) => {
          errorData = data;
          return invalidRes;
        }),
      };

      await handler({ body: {} }, invalidRes);
      expect(errorStatus).toBe(400);
      expect(errorData.success).toBe(false);
      expect(errorData.error).toContain('Missing required "recipe" object');

      // 2. Valid recipe installation
      let successData: any = null;
      const validRes: any = {
        setHeader: vi.fn(),
        status: vi.fn().mockReturnThis(),
        json: vi.fn((data: any) => {
          successData = data;
          return validRes;
        }),
      };

      await handler({ body: { recipe: sampleValidRecipe } }, validRes);
      expect(successData.success).toBe(true);
      expect(successData.providerId).toBe('custom_test_ai_portal');

      // Clean up installed recipe
      RecipeManager.getInstance().deleteRecipe('test_ai_portal');
    });

    it('should handle DELETE /:id', async () => {
      const handler = getRouteHandler('DELETE', '/:id');
      await RecipeManager.getInstance().installRecipe(sampleValidRecipe);

      let deleteData: any = null;
      const res: any = {
        setHeader: vi.fn(),
        status: vi.fn().mockReturnThis(),
        json: vi.fn((data: any) => {
          deleteData = data;
          return res;
        }),
      };

      // Delete existing
      await handler({ params: { id: 'test_ai_portal' } }, res);
      expect(deleteData.success).toBe(true);
      expect(deleteData.message).toContain('deleted successfully');

      // Delete non-existing returns 404
      let notFoundStatus = 200;
      const notFoundRes: any = {
        setHeader: vi.fn(),
        status: vi.fn((code: number) => {
          notFoundStatus = code;
          return notFoundRes;
        }),
        json: vi.fn(),
      };
      await handler({ params: { id: 'non_existent' } }, notFoundRes);
      expect(notFoundStatus).toBe(404);
    });

    it('should handle POST /detect-selectors validation', async () => {
      const handler = getRouteHandler('POST', '/detect-selectors');

      let statusCode = 200;
      let errorData: any = null;
      const res: any = {
        setHeader: vi.fn(),
        status: vi.fn((code: number) => {
          statusCode = code;
          return res;
        }),
        json: vi.fn((data: any) => {
          errorData = data;
          return res;
        }),
      };

      // Missing domSnippet
      await handler({ body: { url: 'https://test.ai' } }, res);
      expect(statusCode).toBe(400);
      expect(errorData.error).toContain('Missing required "domSnippet"');

      // Missing url
      await handler({ body: { domSnippet: '<div></div>' } }, res);
      expect(statusCode).toBe(400);
      expect(errorData.error).toContain('Missing required "url"');
    });
  });
});

vi.mock('../src/main/registry/recipeConsent.js', () => ({ confirmRecipeInstallation: vi.fn(async () => {}) }));
