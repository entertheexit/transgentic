import { dialog } from 'electron';
import type { CustomRecipe } from '../../shared/types/recipe.js';

export const RECIPE_NOTICE = 'This recipe automates a third-party web interface and may synchronize your signed-in session. It grants no permission from that provider. Confirm that your use is authorized, including written permission where required. Provider terms may restrict automation and your account may be suspended.';

/** Confirmation stays in the desktop so extension and IPC imports share the same boundary. */
export async function confirmRecipeInstallation(recipe: CustomRecipe): Promise<void> {
  const text = recipe.disclaimer ? `${RECIPE_NOTICE}\n\n${recipe.disclaimer}` : RECIPE_NOTICE;
  const result = await dialog.showMessageBox({
    type: 'warning',
    title: 'Install web recipe',
    message: `Install ${recipe.title}?`,
    detail: `Target: ${recipe.domainMatch}\n\n${text}`,
    buttons: ['Cancel', 'I understand — install'],
    defaultId: 0,
    cancelId: 0,
    noLink: true,
  });
  if (result.response !== 1) throw new Error('Recipe installation cancelled.');
  recipe.disclaimerAcceptance = {
    version: recipe.disclaimerVersion || recipe.version,
    text,
    acceptedAt: new Date().toISOString(),
  };
}
