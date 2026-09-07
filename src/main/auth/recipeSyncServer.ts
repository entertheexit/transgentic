import { Request, Response, Router } from 'express';
import { BrowserWindow } from 'electron';
import { globalRecipeManager } from '../registry/recipeManager.js';
import { globalSessionManager } from '../webviews/sessionManager.js';
import { ServiceManifestManager } from '../registry/serviceManifest.js';
import { ModelRegistryManager } from '../registry/modelRegistry.js';
import { DynamicRouter } from '../mcp/router.js';

export function createRecipeRouter(): Router {
  const router = Router();

  // Universal CORS middleware for all subroutes & preflight
  router.use((req: Request, res: Response, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    if (req.method === 'OPTIONS') {
      return res.sendStatus(204);
    }
    next();
  });

  /**
   * POST /api/recipes/install-and-sync
   * Installs a CustomRecipe and synchronizes browser session cookies into its partition.
   */
  router.post('/install-and-sync', async (req: Request, res: Response) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    try {
      const { recipe, cookies, userAgent } = req.body || {};
      if (!recipe) {
        return res.status(400).json({ success: false, error: 'Missing required "recipe" object in payload.' });
      }

      const result = await globalRecipeManager.installRecipe(recipe, cookies);

      const { PartitionLifecycleManager } = await import('./partitionLifecycle.js');
      const targetPartition = result.recipe.partition || PartitionLifecycleManager.getPartitionKey(result.providerId);

      try {
        const { AccountRegistryManager } = await import('../registry/accountRegistry.js');
        AccountRegistryManager.setProviderPartition(result.providerId, targetPartition);
        const activeAcc = AccountRegistryManager.getActiveAccount(result.providerId);
        if (result.cookiesCount && result.cookiesCount > 0) {
          AccountRegistryManager.markStatus(result.providerId, activeAcc.id, 'ready');
        }
      } catch {}

      if (userAgent) {
        try {
          const { bindUserAgentToPartition } = await import('../utils/userAgent.js');
          await bindUserAgentToPartition(targetPartition, userAgent);
        } catch {}
      }

      // Immediately refresh status to evaluate the new partition session
      await globalSessionManager.refreshProviderStatus(result.providerId);

      // If drawer webview is currently open for this provider, navigate to entryUrl so it logs in immediately
      const entryUrl = result.recipe.url || `https://${result.recipe.domainMatch}`;
      try {
        const webContents = globalSessionManager.getWebContents(result.providerId);
        if (webContents && !webContents.isDestroyed()) {
          webContents.loadURL(entryUrl).catch(() => {
            webContents.reload();
          });
        }
      } catch {}

      // Broadcast update to all Electron windows
      try {
        const { AccountRegistryManager } = await import('../registry/accountRegistry.js');
        if (BrowserWindow && typeof BrowserWindow.getAllWindows === 'function') {
          BrowserWindow.getAllWindows().forEach((win) => {
            if (!win.isDestroyed()) {
              win.webContents.send('recipe:installed', result);
              win.webContents.send('account-registry-updated', AccountRegistryManager.getAll());
              win.webContents.send('provider-status-updated', globalSessionManager.getAllStatuses());
              win.webContents.send('services-manifest-updated', ServiceManifestManager.getManifest());
              win.webContents.send('models-updated', ModelRegistryManager.getRegistry());
              win.webContents.send('route-matrix-updated', DynamicRouter.getRouteMatrix());
              win.webContents.send('mode-routes-updated', DynamicRouter.getAllRouteConfigs());
            }
          });
        }
      } catch {}

      return res.json({
        success: true,
        message: `Successfully installed custom recipe "${result.recipe.name || (result.recipe as any).title || result.providerId}" (${result.providerId}).`,
        providerId: result.providerId,
        recipe: result.recipe,
        cookiesCount: result.cookiesCount || 0,
      });
    } catch (err: any) {
      console.error('[RecipeSyncServer] install-and-sync failed:', err);
      const errMsg = typeof err === 'object' && err !== null ? (err.message || JSON.stringify(err)) : String(err || 'Failed to install and sync recipe.');
      return res.status(400).json({
        success: false,
        error: errMsg,
      });
    }
  });

  /**
   * POST /api/recipes/detect-selectors
   * Auto-detects CSS selectors from a pruned DOM snippet using the Local LLM engine.
   */
  router.post('/detect-selectors', async (req: Request, res: Response) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    try {
      const { domSnippet, url, title } = req.body || {};
      if (!domSnippet || typeof domSnippet !== 'string') {
        return res.status(400).json({
          success: false,
          error: 'Missing required "domSnippet" string in payload.',
        });
      }
      if (!url || typeof url !== 'string') {
        return res.status(400).json({
          success: false,
          error: 'Missing required "url" string in payload.',
        });
      }

      const generatedRecipe = await globalRecipeManager.detectSelectorsWithLocalLlm(
        domSnippet,
        url,
        title
      );

      return res.json({
        success: true,
        recipe: generatedRecipe,
      });
    } catch (err: any) {
      console.error('[RecipeSyncServer] detect-selectors failed:', err);
      return res.status(500).json({
        success: false,
        error: err.message || 'Local LLM selector detection failed.',
      });
    }
  });

  /**
   * GET /api/recipes
   * Lists all installed custom recipes.
   */
  router.get('/', (_req: Request, res: Response) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    try {
      const recipes = globalRecipeManager.getCustomRecipes();
      return res.json({ success: true, recipes });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err.message });
    }
  });

  /**
   * DELETE /api/recipes/:id
   * Deletes a custom recipe and unregisters its service.
   */
  router.delete('/:id', (req: Request, res: Response) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    try {
      const id = req.params.id as string;
      const success = globalRecipeManager.deleteRecipe(id);
      if (!success) {
        return res.status(404).json({ success: false, error: `Recipe "${id}" not found.` });
      }

      try {
        if (BrowserWindow && typeof BrowserWindow.getAllWindows === 'function') {
          BrowserWindow.getAllWindows().forEach((win) => {
            if (!win.isDestroyed()) {
              win.webContents.send('recipe:deleted', { id });
              win.webContents.send('provider-status-updated', globalSessionManager.getAllStatuses());
              win.webContents.send('services-manifest-updated', ServiceManifestManager.getManifest());
              win.webContents.send('models-updated', ModelRegistryManager.getRegistry());
              win.webContents.send('route-matrix-updated', DynamicRouter.getRouteMatrix());
              win.webContents.send('mode-routes-updated', DynamicRouter.getAllRouteConfigs());
            }
          });
        }
      } catch {}

      return res.json({ success: true, message: `Recipe "${id}" deleted successfully.` });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err.message });
    }
  });

  return router;
}
