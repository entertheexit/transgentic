import { CustomRecipeAdapter } from "./customRecipeAdapter.js";
import { BUILTIN_RECIPES } from "../../shared/types/recipe.js";

/**
 * GeminiAdapter
 * 100% Pure Recipe Adapter backed by BUILTIN_RECIPES.gemini.
 * Original raw implementation archived in backup/adapters/geminiAdapter.ts.
 */
export class GeminiAdapter extends CustomRecipeAdapter {
  constructor() {
    super(BUILTIN_RECIPES.gemini);
  }
}
