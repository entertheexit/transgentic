import { beforeEach, describe, expect, it, vi } from 'vitest';
import { dialog } from 'electron';
import { confirmRecipeInstallation, RECIPE_NOTICE } from '../src/main/registry/recipeConsent.js';
import { validateCustomRecipe } from '../src/shared/types/recipe.js';

vi.mock('electron', () => ({ dialog: { showMessageBox: vi.fn() } }));

describe('Desktop recipe installation consent', () => {
  beforeEach(() => vi.resetAllMocks());
  const recipe = () => validateCustomRecipe({
    id: 'example', title: 'Example', domainMatch: 'portal.example',
    version: '2', disclaimer: 'Example provider notice', disclaimerVersion: 'notice-3',
    selectors: { inputPrompt: 'textarea', submitButton: '.send' },
    response: { container: '.answer', modes: { text: { enabled: true } } },
  }).recipe!;

  it('cancels without recording acceptance', async () => {
    vi.mocked(dialog.showMessageBox).mockResolvedValue({ response: 0, checkboxChecked: false });
    const value = recipe();
    await expect(confirmRecipeInstallation(value)).rejects.toThrow('cancelled');
    expect(value.disclaimerAcceptance).toBeUndefined();
  });

  it('records the exact notice, version and timestamp after affirmative desktop confirmation', async () => {
    vi.mocked(dialog.showMessageBox).mockResolvedValue({ response: 1, checkboxChecked: false });
    const value = recipe();
    await confirmRecipeInstallation(value);
    expect(value.disclaimerAcceptance?.version).toBe('notice-3');
    expect(value.disclaimerAcceptance?.text).toBe(`${RECIPE_NOTICE}\n\nExample provider notice`);
    expect(Number.isFinite(Date.parse(value.disclaimerAcceptance!.acceptedAt))).toBe(true);
    expect(validateCustomRecipe(value).recipe?.disclaimerAcceptance).toEqual(value.disclaimerAcceptance);
    expect(dialog.showMessageBox).toHaveBeenCalledWith(expect.objectContaining({ defaultId: 0, cancelId: 0 }));
  });
});
