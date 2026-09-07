import { CustomRecipeAdapter } from "./customRecipeAdapter.js";
import { BUILTIN_RECIPES } from "../../shared/types/recipe.js";

/**
 * ChatGPTAdapter
 * 100% Pure Recipe Adapter backed by BUILTIN_RECIPES.chatgpt.
 * Original raw implementation archived in backup/adapters/chatgptAdapter.ts.
 */
export class ChatGPTAdapter extends CustomRecipeAdapter {
  constructor() {
    super(BUILTIN_RECIPES.chatgpt);
  }
}
