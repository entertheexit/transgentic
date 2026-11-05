import { BUILTIN_RECIPES } from './generated/builtinRecipes.js';

export type BuiltinProviderId = keyof typeof BUILTIN_RECIPES;

/** Built-in membership is independent of user-selected routing order. */
export const BUILTIN_PROVIDER_IDS = Object.freeze(Object.keys(BUILTIN_RECIPES) as BuiltinProviderId[]);

export function isBuiltinProvider(id: string): id is BuiltinProviderId {
  return Object.hasOwn(BUILTIN_RECIPES, id);
}
