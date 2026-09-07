import { CustomRecipeAdapter } from "./customRecipeAdapter.js";
import { BUILTIN_RECIPES } from "../../shared/types/recipe.js";

/**
 * GrokAdapter
 * 100% Pure Recipe Adapter backed by BUILTIN_RECIPES.grok.
 * Original raw implementation archived in backup/adapters/grokAdapter.ts.
 */
export class GrokAdapter extends CustomRecipeAdapter {
  constructor() {
    super(BUILTIN_RECIPES.grok);
  }
}
