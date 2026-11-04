import { describe, expect, it } from 'vitest';
import { BUILTIN_RECIPES } from '../src/shared/generated/builtinRecipes.js';
import { validateCustomRecipe } from '../src/shared/types/recipe.js';

describe('temporary chat recipe variants', () => {
  it('preserves exact personalization locators through validation', () => {
    const recipe = structuredClone(BUILTIN_RECIPES.chatgpt);
    recipe.temporaryChat!.variants = {
      unpersonalized: {
        activationSteps: [{ action: 'click', target: { role: 'menuitem', name: 'Unpersonalized' } }],
        activeWhen: { role: 'button', name: 'Unpersonalized' },
      },
    };
    const result = validateCustomRecipe(recipe);
    expect(result.valid).toBe(true);
    expect(result.recipe?.temporaryChat?.variants).toEqual(recipe.temporaryChat!.variants);
  });

  it('rejects variants without positive verification or valid activation', () => {
    const recipe = structuredClone(BUILTIN_RECIPES.chatgpt) as any;
    recipe.temporaryChat.variants = {
      personalized: { activationSteps: [{ action: 'navigate' }] },
    };
    expect(validateCustomRecipe(recipe).valid).toBe(false);
  });

  it('rejects unknown variant names', () => {
    const recipe = structuredClone(BUILTIN_RECIPES.chatgpt) as any;
    recipe.temporaryChat.variants = { arbitrary: {} };
    expect(validateCustomRecipe(recipe).valid).toBe(false);
  });
});

import { CustomRecipeAdapter } from '../src/main/webviews/customRecipeAdapter.js';
import { vi } from 'vitest';

it('requires prior personalization proof and native UI for bound continuation', async () => {
  const adapter = new CustomRecipeAdapter(BUILTIN_RECIPES.chatgpt);
  let url = 'https://chatgpt.com/?temporary-chat=true';
  const view = { isDestroyed: () => false, getURL: () => url } as any;
  adapter.setWebContents(view);
  (adapter as any).temporarySelection = 'temporary-personalized';
  let picker = false;
  let nativeMarker = true;
  vi.spyOn(adapter as any, 'locatorExists').mockImplementation(async (locator: any) => {
    if (locator.name === 'Personalized') return picker;
    if (locator.name === 'Unpersonalized') return false;
    return nativeMarker;
  });
  expect(await adapter.verifyTemporaryChat()).toBe(false);
  picker = true;
  expect(await adapter.verifyTemporaryChat()).toBe(true);
  picker = false;
  url = 'https://chatgpt.com/c/local-chatgpt%3Afirst?temporary-chat=true';
  expect(await adapter.verifyTemporaryChat()).toBe(true);
  url = 'https://chatgpt.com/c/server-id?temporary-chat=true';
  expect(await adapter.verifyTemporaryChat()).toBe(true);
  nativeMarker = false;
  expect(await adapter.verifyTemporaryChat()).toBe(false);
  nativeMarker = true;
  url = 'https://chatgpt.com/c/different-id?temporary-chat=true';
  expect(await adapter.verifyTemporaryChat()).toBe(false);
});
