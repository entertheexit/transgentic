import { CustomRecipeAdapter } from "./customRecipeAdapter.js";
import { BUILTIN_RECIPES } from "../../shared/types/recipe.js";

/**
 * ClaudeAdapter
 * 100% Pure Recipe Adapter backed by BUILTIN_RECIPES.claude.
 * Original raw implementation archived in backup/adapters/claudeAdapter.ts.
 */
export class ClaudeAdapter extends CustomRecipeAdapter {
  constructor() {
    super(BUILTIN_RECIPES.claude);
  }
}
