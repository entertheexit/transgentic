import React, { useRef, useState, useEffect } from 'react';
import { AccountProfile, ProviderAccountStore, ProviderId, ProviderStatus, LocalLLMConfig, CustomRecipe } from '../../shared/types.js';
import { ChevronLeft, RefreshCw, ExternalLink, ShieldCheck, KeyRound, Globe, Users, Sparkles, Link, Wrench, Info, CheckCircle2, AlertCircle, X, ShieldAlert, AlertTriangle, Copy, Code, Upload, Target, Check, RotateCcw } from 'lucide-react';
import { soundFx } from '../audio/soundFx.js';
import { AuthModal } from './AuthModal.js';

interface DrawerWebviewProps {
  provider: ProviderStatus;
  accountStore?: ProviderAccountStore;
  onClose: () => void;
  onReload: (id: ProviderId) => void;
  onOpenWindow: (id: ProviderId, partitionKey?: string) => void;
  onOpenSystemBrowser?: (id: ProviderId) => void;
  onOpenAccountModal?: () => void;
  onAuditDom?: (id: ProviderId) => Promise<any>;
  onHealDom?: (id: ProviderId) => Promise<any>;
  healingReport?: any;
  localLLMConfig?: LocalLLMConfig;
  onOpenLocalLlm?: () => void;
}

export const DrawerWebview: React.FC<DrawerWebviewProps> = ({
  provider,
  accountStore,
  onClose,
  onReload,
  onOpenWindow,
  onOpenSystemBrowser,
  onOpenAccountModal,
  onAuditDom,
  onHealDom,
  healingReport,
  localLLMConfig,
  onOpenLocalLlm,
}) => {
  const webviewRef = useRef<any>(null);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [showHealingFlyout, setShowHealingFlyout] = useState(false);
  const [activeFlyoutTab, setActiveFlyoutTab] = useState<'watchdog' | 'wizard'>('watchdog');
  const [isAuditing, setIsAuditing] = useState(false);
  const [isHealing, setIsHealing] = useState(false);
  const [healingMsg, setHealingMsg] = useState<string | null>(null);
  const [customRecipeJson, setCustomRecipeJson] = useState('');
  const [isCopyingPrompt, setIsCopyingPrompt] = useState(false);
  const [isDetectingRecipe, setIsDetectingRecipe] = useState(false);
  const [recipeInfo, setRecipeInfo] = useState<CustomRecipe | null>(null);
  const [recipeHistory, setRecipeHistory] = useState<Array<{ version: string; timestamp: number; path: string }>>([]);
  const [isRollbacking, setIsRollbacking] = useState(false);
  const [isResetting, setIsResetting] = useState(false);

  const activeAccount = accountStore?.accounts?.find((a) => a.id === accountStore.activeAccountId) || accountStore?.accounts?.[0];
  const activePartition = activeAccount?.partitionKey || provider.partition;
  const displayName = (provider?.name || '').replace(/\s*\(.*?\)/g, '').trim();

  const isInspectorRunningRef = useRef(false);

  // Bridge console messages and navigation from webview for Visual Inspector
  useEffect(() => {
    const wv = webviewRef.current;
    if (!wv) return;

    const handleConsoleMessage = async (e: any) => {
      const msg = e.message || '';
      if (msg.startsWith('TRANSGENTIC_INSPECTOR_RESULT_EVENT:')) {
        isInspectorRunningRef.current = false;
        const rawJson = msg.replace('TRANSGENTIC_INSPECTOR_RESULT_EVENT:', '');
        try {
          const recipe = JSON.parse(rawJson);
          const api = (window as any).transgenticApi;
          if (api?.installRecipe) {
            const res = await api.installRecipe(recipe);
            if (res?.success) {
              soundFx.playTaskSuccess();
              setHealingMsg(`✓ Recipe "${recipe.name || recipe.title || recipe.id}" saved and applied!`);
              handleReload();
            }
          }
        } catch (err: any) {
          setHealingMsg('Could not process inspector result: ' + (err?.message || err));
        }
      }
    };

    const handleWebviewNavigation = async () => {
      if (!isInspectorRunningRef.current) return;
      const api = (window as any).transgenticApi;
      if (!api?.getInspectorScript) return;
      try {
        const script = await api.getInspectorScript();
        if (script) {
          await wv.executeJavaScript(`
            (function() {
              window.__transgenticInspectorCallback = function(recipe) {
                console.log('TRANSGENTIC_INSPECTOR_RESULT_EVENT:' + JSON.stringify(recipe));
              };
              window.addEventListener('message', function(e) {
                if (e.data && e.data.type === 'TRANSGENTIC_INSPECTOR_RESULT') {
                  console.log('TRANSGENTIC_INSPECTOR_RESULT_EVENT:' + JSON.stringify(e.data.recipe));
                }
              });
            })();
          `);
          await wv.executeJavaScript(script);
        }
      } catch {}
    };

    wv.addEventListener('console-message', handleConsoleMessage);
    wv.addEventListener('did-navigate', handleWebviewNavigation);
    wv.addEventListener('did-navigate-in-page', handleWebviewNavigation);

    return () => {
      wv.removeEventListener('console-message', handleConsoleMessage);
      wv.removeEventListener('did-navigate', handleWebviewNavigation);
      wv.removeEventListener('did-navigate-in-page', handleWebviewNavigation);
    };
  }, [webviewRef.current]);

  const handleCopyAgenticPrompt = async () => {
    soundFx.playClick();
    if (!webviewRef.current) return;
    setIsCopyingPrompt(true);
    setHealingMsg(null);
    try {
      const domSnippet = await webviewRef.current.executeJavaScript(`
        (function() {
          const clone = document.body.cloneNode(true);
          const removeTags = ['script', 'style', 'svg', 'path', 'iframe', 'noscript', 'img', 'video', 'audio'];
          removeTags.forEach(t => clone.querySelectorAll(t).forEach(el => el.remove()));
          const interesting = clone.querySelectorAll('form, textarea, input, button, [contenteditable], [role="textbox"], [data-testid], main, article');
          let s = '';
          interesting.forEach(el => { s += el.outerHTML.slice(0, 400) + '\\n'; });
          return (s.length > 200 ? s : clone.innerHTML).slice(0, 5000);
        })()
      `);

      const cleanSlug = provider.id.replace(/^custom_|^webview_/, '');
      let hostDomain = '';
      try { if (provider.url) hostDomain = new URL(provider.url).hostname; } catch {}

      const prompt = `You are an expert web automation engineer creating a Transgentic Custom Recipe JSON for:
- Service: ${displayName} (${provider.url || ''})
- Domain: ${hostDomain}

Here is the pruned DOM structure of the page:
\`\`\`html
${domSnippet}
\`\`\`

Generate a valid Transgentic Custom Recipe JSON conforming to this schema:
{
  "id": "${cleanSlug}",
  "name": "${displayName}",
  "domain": "${hostDomain}",
  "url": "${provider.url || ''}",
  "selectors": {
    "inputPrompt": "CSS selector for prompt input",
    "submitButton": "CSS selector for submit button",
    "responseContainer": "CSS selector for response container",
    "textResponse": "CSS selector for response text",
    "modelSwitcher": "CSS selector (optional)",
    "stopButton": "CSS selector (optional)"
  },
  "response": {
    "container": "CSS selector for response container",
    "textSelector": "CSS selector for response text",
    "modes": {
      "text": {
        "enabled": true,
        "mediaKind": "text",
        "inputAttachments": {
          "fileInput": "Observed input[type=file] selector",
          "revealSteps": [{ "action": "click", "target": { "selectors": "Stable CSS fallback", "role": "button", "name": ["Exact accessible label"] } }],
          "acceptedKinds": ["image", "document"],
          "multiple": true
        }
      }
    }
  },
  "author": "Transgentic Assistant"
}

Only include inputAttachments when upload controls or a native file input are present in the supplied DOM. Store only the minimum reveal clicks and avoid generated framework IDs.
Respond ONLY with valid JSON.`;

      await navigator.clipboard.writeText(prompt);
      soundFx.playTaskSuccess();
      setHealingMsg('✓ Copied Agentic prompt to clipboard! Paste into Claude/ChatGPT and paste the resulting JSON below.');
    } catch (err: any) {
      soundFx.playWarnTone();
      setHealingMsg('Failed to extract DOM: ' + (err?.message || err));
    } finally {
      setIsCopyingPrompt(false);
    }
  };

  const handleDetectWithLocalLlm = async () => {
    soundFx.playClick();
    if (!webviewRef.current) return;
    setIsDetectingRecipe(true);
    setHealingMsg('Analyzing webview DOM with Local LLM...');
    try {
      const domSnippet = await webviewRef.current.executeJavaScript(`
        (function() {
          const clone = document.body.cloneNode(true);
          const removeTags = ['script', 'style', 'svg', 'path', 'iframe', 'noscript'];
          removeTags.forEach(t => clone.querySelectorAll(t).forEach(el => el.remove()));
          const interesting = clone.querySelectorAll('form, textarea, input, button, [contenteditable], [role="textbox"], [data-testid], main');
          let s = '';
          interesting.forEach(el => { s += el.outerHTML.slice(0, 400) + '\\n'; });
          return (s.length > 200 ? s : clone.innerHTML).slice(0, 5000);
        })()
      `);

      const api = (window as any).transgenticApi;
      if (!api?.detectRecipeSelectors) {
        throw new Error('detectRecipeSelectors API not available');
      }

      const res = await api.detectRecipeSelectors(domSnippet, provider.url || '', displayName);
      if (res?.success && res.recipe) {
        soundFx.playTaskSuccess();
        setCustomRecipeJson(JSON.stringify(res.recipe, null, 2));
        setHealingMsg(`✓ Selectors detected by Local LLM! Review and click "Apply Recipe" below.`);
      } else {
        throw new Error(res?.error || 'Local LLM selector detection failed.');
      }
    } catch (err: any) {
      soundFx.playWarnTone();
      setHealingMsg('Detection error: ' + (err?.message || err));
    } finally {
      setIsDetectingRecipe(false);
    }
  };

  const handleLaunchVisualInspector = async () => {
    soundFx.playClick();
    const api = (window as any).transgenticApi;
    if (!api?.getInspectorScript || !webviewRef.current) {
      setHealingMsg('Inspector script is not available.');
      return;
    }

    try {
      const script = await api.getInspectorScript();
      if (!script) {
        setHealingMsg('Could not load inspector script.');
        return;
      }

      setShowHealingFlyout(false);

      // Prepare listener in webview
      await webviewRef.current.executeJavaScript(`
        (function() {
          window.__transgenticInspectorCallback = function(recipe) {
            console.log('TRANSGENTIC_INSPECTOR_RESULT_EVENT:' + JSON.stringify(recipe));
          };
          window.addEventListener('message', function(e) {
            if (e.data && e.data.type === 'TRANSGENTIC_INSPECTOR_RESULT') {
              console.log('TRANSGENTIC_INSPECTOR_RESULT_EVENT:' + JSON.stringify(e.data.recipe));
            }
          });
        })();
      `);

      // Inject visual overlay into webview
      isInspectorRunningRef.current = true;
      await webviewRef.current.executeJavaScript(script);
    } catch (err: any) {
      isInspectorRunningRef.current = false;
      setHealingMsg('Failed to inject inspector: ' + (err?.message || err));
    }
  };

  const handleImportCustomRecipe = async () => {
    soundFx.playClick();
    if (!customRecipeJson.trim()) return;
    try {
      const parsed = JSON.parse(customRecipeJson);
      const api = (window as any).transgenticApi;
      if (!api?.installRecipe) throw new Error('Recipe API not available');
      const res = await api.installRecipe(parsed);
      if (res?.success) {
        soundFx.playTaskSuccess();
        setHealingMsg(`✓ Successfully installed recipe "${parsed.name || parsed.id}"!`);
        setCustomRecipeJson('');
        handleReload();
      } else {
        throw new Error(res?.error || 'Installation failed');
      }
    } catch (err: any) {
      soundFx.playWarnTone();
      setHealingMsg('Import failed: ' + (err?.message || err));
    }
  };

  const handleReload = () => {
    soundFx.playClick();
    if (webviewRef.current) {
      webviewRef.current.reload();
    }
    onReload(provider.id);
  };

  const handleOpenWindow = () => {
    soundFx.playClick();
    onOpenWindow(provider.id, activePartition);
  };

  const handleOpenSystemBrowser = () => {
    soundFx.playClick();
    if (onOpenSystemBrowser) {
      onOpenSystemBrowser(provider.id);
    }
  };

  const handleAudit = async () => {
    soundFx.playClick();
    if (!onAuditDom) return;
    setIsAuditing(true);
    setHealingMsg(null);
    try {
      const res = await onAuditDom(provider.id);
      const isHealthy = res?.allLandmarksHealthy ?? res?.healthy;
      if (isHealthy) {
        soundFx.playTaskSuccess();
        setHealingMsg('All control landmarks are healthy and detected.');
      } else {
        soundFx.playWarnTone();
        setHealingMsg('Selector discrepancies detected! Click "Auto-Repair Now".');
      }
    } catch (err: any) {
      setHealingMsg(`Audit failed: ${err?.message || err}`);
    } finally {
      setIsAuditing(false);
    }
  };

  const loadRecipeInfo = async () => {
    try {
      const api = (window as any).transgenticApi;
      if (api?.getRecipes) {
        const recipes: CustomRecipe[] = await api.getRecipes();
        const found = recipes.find((r: any) => r.id === provider.id);
        setRecipeInfo(found || null);
      }
      if (api?.getRecipeHistory) {
        const history = await api.getRecipeHistory(provider.id);
        setRecipeHistory(history || []);
      }
    } catch {}
  };

  useEffect(() => {
    if (showHealingFlyout) {
      loadRecipeInfo();
    }
  }, [showHealingFlyout, provider.id]);

  const handleResetToDefault = async () => {
    soundFx.playClick();
    const api = (window as any).transgenticApi;
    if (!api?.resetRecipeToDefault) return;
    setIsResetting(true);
    setHealingMsg(null);
    try {
      const res = await api.resetRecipeToDefault(provider.id);
      if (res?.success) {
        soundFx.playTaskSuccess();
        setHealingMsg(`✓ Reset ${displayName} to default pristine recipe!`);
        await loadRecipeInfo();
        handleReload();
      } else {
        setHealingMsg('Could not reset recipe to default');
      }
    } catch (err: any) {
      setHealingMsg('Reset failed: ' + (err?.message || err));
    } finally {
      setIsResetting(false);
    }
  };

  const handleRollback = async (version: string) => {
    soundFx.playClick();
    const api = (window as any).transgenticApi;
    if (!api?.rollbackRecipe) return;
    setIsRollbacking(true);
    setHealingMsg(null);
    try {
      const res = await api.rollbackRecipe(provider.id, version);
      if (res?.success) {
        soundFx.playTaskSuccess();
        setHealingMsg(`✓ Rolled back ${displayName} to version ${version}!`);
        await loadRecipeInfo();
        handleReload();
      } else {
        setHealingMsg(`Rollback failed: ${res?.error || 'Snapshot not found'}`);
      }
    } catch (err: any) {
      setHealingMsg('Rollback failed: ' + (err?.message || err));
    } finally {
      setIsRollbacking(false);
    }
  };

  const handleHeal = async () => {
    soundFx.playClick();
    if (!onHealDom) return;
    setIsHealing(true);
    setHealingMsg(null);
    try {
      const res = await onHealDom(provider.id);
      if (res?.success) {
        soundFx.playTaskSuccess();
        setHealingMsg(`Successfully repaired landmarks via ${res.healedBy}! ${res.newVersion ? `(v${res.newVersion})` : ''}`);
        await loadRecipeInfo();
      } else {
        soundFx.playWarnTone();
        setHealingMsg(`Repair note: ${res?.error || 'Could not find replacement selectors'}`);
      }
    } catch (err: any) {
      setHealingMsg(`Repair failed: ${err?.message || err}`);
    } finally {
      setIsHealing(false);
    }
  };

  return (
    <div className="w-full h-full flex flex-col bg-[#0b0c0e] select-none">
      {/* Drawer Top Navigation Bar */}
      <div className="h-10 px-3 bg-[#13151b] border-b border-white/10 flex items-center justify-between drag-region">
        {/* Left Side: Provider Identity + URL Tag */}
        <div className="flex items-center gap-2 no-drag">
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
            <span className="font-bold text-xs text-slate-100 uppercase tracking-wide">
              {displayName}
            </span>
          </div>

          {Boolean(provider.url && provider.url.startsWith('http')) && (
            <button
              onClick={handleOpenSystemBrowser}
              className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-white/5 hover:bg-white/10 text-slate-400 hover:text-slate-200 text-[10px] font-mono transition-colors cursor-pointer"
              title="Open in System Browser"
            >
              <Globe className="w-2.5 h-2.5" />
              <span>Open Browser</span>
              <ExternalLink className="w-2.5 h-2.5 opacity-60" />
            </button>
          )}
        </div>

        {/* Right Side: Account Switcher + Actions */}
        <div className="flex items-center gap-1.5 no-drag">
          {accountStore && (
            <button
              onClick={() => {
                soundFx.playClick();
                if (onOpenAccountModal) onOpenAccountModal();
              }}
              title="Manage Account Profiles for this provider"
              className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 text-[11px] font-medium transition-all cursor-pointer"
            >
              <Users className="w-3.5 h-3.5 text-cyan-400" />
              <span className="max-w-[110px] truncate">{activeAccount?.alias || 'Profiles'}</span>
            </button>
          )}

          <button
            onClick={() => {
              soundFx.playClick();
              setShowAuthModal(true);
            }}
            title="Chrome Extension Session Sync (One-click multi-profile authentication)"
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-teal-500/20 hover:bg-teal-500/30 text-teal-300 border border-teal-500/40 text-[11px] font-semibold transition-all shadow-[0_0_10px_rgba(20,184,166,0.2)] cursor-pointer"
          >
            <Link className="w-3.5 h-3.5 text-teal-400" />
            <span>Chrome Sync</span>
          </button>

          <button
            onClick={() => {
              soundFx.playClick();
              setShowHealingFlyout(!showHealingFlyout);
            }}
            title="DOM Self-Healing & Landmark Watchdog"
            className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-medium transition-all cursor-pointer ${
              showHealingFlyout
                ? 'bg-orange-500/30 text-orange-200 border border-orange-500/50 shadow-[0_0_10px_rgba(249,115,22,0.3)]'
                : 'bg-orange-500/15 hover:bg-orange-500/25 text-orange-300 border border-orange-500/30'
            }`}
          >
            <Wrench className="w-3.5 h-3.5 text-orange-400" />
            <span>Self-Healing</span>
          </button>

          <button
            onClick={handleReload}
            title="Reload Webview & Refresh Status"
            className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-slate-300 border border-white/10 transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>

          <button
            onClick={() => {
              soundFx.playClick();
              onClose();
            }}
            title="Close Drawer"
            className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white border border-white/10 transition-colors cursor-pointer"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Embedded Webview Container (Solid Opaque Interior) */}
      <div className="flex-1 relative bg-[#0f1013] overflow-hidden">
        {provider.url ? (
          /* @ts-ignore */
          <webview
            key={`${provider.id}_${activePartition}_${provider.url}`}
            ref={webviewRef}
            src={provider.url}
            partition={activePartition}
            className="w-full h-full border-none"
            allowpopups
          />
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-slate-400 gap-3 p-6 text-center">
            <Globe className="w-10 h-10 text-teal-400/60 animate-pulse" />
            <div className="text-sm font-medium text-slate-200">{displayName || 'Community Webview'}</div>
            <p className="text-xs text-slate-400 max-w-sm">
              No active URL configured yet. Open the service in Chrome and click <strong>Sync Session</strong> in the Transgentic Auth extension to synchronize this web session.
            </p>
            <button
              onClick={() => setShowAuthModal(true)}
              className="mt-2 px-3 py-1.5 rounded-lg bg-teal-500/20 hover:bg-teal-500/30 text-teal-300 border border-teal-500/40 text-xs font-mono transition-colors cursor-pointer"
            >
              Open Chrome Extension Guide
            </button>
          </div>
        )}
      </div>

      {/* Drawer Footer Notice (Seamless h-7 with Left Bottom Bar) */}
      <div className="h-7 px-4 bg-transparent flex items-center justify-between text-[10px] font-mono text-slate-400 border-t border-white/5 drag-region">
        <div className="flex items-center gap-1.5 no-drag">
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
          <span>Isolated Profile Partition: Host-aligned User-Agent</span>
        </div>

        <div className="flex items-center gap-3 no-drag">
          <button
            onClick={() => {
              soundFx.playClick();
              setShowAuthModal(true);
            }}
            className="flex items-center gap-1 text-teal-300 hover:text-teal-200 text-[10px] font-mono underline underline-offset-2 cursor-pointer"
          >
            <Link className="w-3 h-3 text-teal-400" />
            <span>Chrome Sync Extension</span>
          </button>
        </div>
      </div>

      {/* Chrome Auth & Session Sync Modal */}
      <AuthModal
        isOpen={showAuthModal}
        onClose={() => setShowAuthModal(false)}
        providerId={provider.id}
        providerName={displayName}
        providerUrl={provider.url}
        onSynced={() => {
          handleReload();
        }}
      />

      {/* DOM Self-Healing & Landmark Watchdog Modal */}
      {showHealingFlyout && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in no-drag">
          <div className="relative w-full max-w-lg bg-[#0d0f14] border border-orange-500/40 rounded-2xl shadow-[0_0_40px_rgba(249,115,22,0.2)] p-4 space-y-3.5">
            <div className="flex items-center justify-between pb-2 border-b border-white/10">
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-orange-500/20 border border-orange-500/40 text-orange-300">
                  <Wrench className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-xs font-bold text-slate-100 uppercase tracking-wide font-mono">
                    DOM Watchdog &amp; Recipe Wizard ({displayName})
                  </h3>
                  <p className="text-[10px] text-slate-400">
                    Live landmark inspection, selector repair &amp; recipe mapping engine.
                  </p>
                </div>
              </div>

              <button
                onClick={() => {
                  soundFx.playClick();
                  setShowHealingFlyout(false);
                }}
                className="p-1 rounded-lg bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Navigation Tab Bar */}
            <div className="flex items-center gap-1.5 p-1 rounded-xl bg-black/50 border border-white/5 font-mono text-xs">
              <button
                onClick={() => {
                  soundFx.playClick();
                  setActiveFlyoutTab('watchdog');
                }}
                className={`flex-1 py-1 px-2.5 rounded-lg text-[11px] font-semibold transition-all ${
                  activeFlyoutTab === 'watchdog'
                    ? 'bg-orange-500/20 text-orange-300 border border-orange-500/40 shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Landmarks Watchdog
              </button>
              <button
                onClick={() => {
                  soundFx.playClick();
                  setActiveFlyoutTab('wizard');
                }}
                className={`flex-1 py-1 px-2.5 rounded-lg text-[11px] font-semibold transition-all ${
                  activeFlyoutTab === 'wizard'
                    ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Recipe Wizard (3 Options)
              </button>
            </div>

            {/* Tab 1: Landmarks Watchdog */}
            {activeFlyoutTab === 'watchdog' && (
              <div className="space-y-3">
                {/* Informational Callout Notice */}
                <div className="p-2.5 rounded-xl bg-orange-950/20 border border-orange-500/30 flex items-start gap-2 text-[10.5px] leading-relaxed text-orange-200">
                  <ShieldAlert className="w-4 h-4 text-orange-400 shrink-0 mt-0.5" />
                  <div>
                    <strong className="text-orange-300">Local LLM Exclusive Engine (Manual Only):</strong> To prevent cloud AI safety policy violations and avoid polluting your cloud chat histories, DOM selector repair runs <strong>exclusively through your Local LLM (Ollama / LM Studio)</strong> on-demand.
                  </div>
                </div>

                {/* Local LLM Disabled Banner */}
                {!localLLMConfig?.enabled && (
                  <div className="p-2.5 rounded-xl bg-amber-950/20 border border-amber-500/30 flex items-center justify-between text-[10.5px] text-amber-200">
                    <div className="flex items-center gap-1.5">
                      <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                      <span>Local LLM is disabled. Enable it to repair DOM landmarks.</span>
                    </div>
                    {onOpenLocalLlm && (
                      <button
                        onClick={() => {
                          setShowHealingFlyout(false);
                          onOpenLocalLlm();
                        }}
                        className="px-2 py-1 rounded bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/30 font-mono text-[9.5px] cursor-pointer"
                      >
                        Configure Local LLM
                      </button>
                    )}
                  </div>
                )}

                {/* Landmarks status */}
                <div className="p-3 rounded-xl bg-black/40 border border-white/5 space-y-2">
                  <span className="text-[10px] font-mono uppercase text-slate-400 block font-semibold">
                    Control Landmarks Status:
                  </span>
                  <div className="grid grid-cols-2 gap-2 text-[10px] font-mono">
                    <div className="p-2 rounded-lg bg-black/50 border border-white/5 flex items-center justify-between">
                      <span className="text-slate-300">Input Prompt:</span>
                      <span className={`px-1.5 py-0.2 rounded font-bold ${
                        (healingReport?.landmarks?.inputPrompt?.found ?? healingReport?.landmarks?.inputPrompt?.exists) ? 'text-emerald-400 bg-emerald-500/10' : 'text-slate-500 bg-white/5'
                      }`}>
                        {(healingReport?.landmarks?.inputPrompt?.found ?? healingReport?.landmarks?.inputPrompt?.exists) ? 'HEALTHY' : 'PENDING'}
                      </span>
                    </div>
                    <div className="p-2 rounded-lg bg-black/50 border border-white/5 flex items-center justify-between">
                      <span className="text-slate-300">Submit Button:</span>
                      <span className={`px-1.5 py-0.2 rounded font-bold ${
                        (healingReport?.landmarks?.submitButton?.found ?? healingReport?.landmarks?.submitButton?.exists) ? 'text-emerald-400 bg-emerald-500/10' : 'text-slate-500 bg-white/5'
                      }`}>
                        {(healingReport?.landmarks?.submitButton?.found ?? healingReport?.landmarks?.submitButton?.exists) ? 'HEALTHY' : 'PENDING'}
                      </span>
                    </div>
                    <div className="p-2 rounded-lg bg-black/50 border border-white/5 flex items-center justify-between">
                      <span className="text-slate-300">Stop Button:</span>
                      <span className={`px-1.5 py-0.2 rounded font-bold ${
                        (healingReport?.landmarks?.stopButton?.found ?? healingReport?.landmarks?.stopButton?.exists) ? 'text-emerald-400 bg-emerald-500/10' : 'text-slate-500 bg-white/5'
                      }`}>
                        {(healingReport?.landmarks?.stopButton?.found ?? healingReport?.landmarks?.stopButton?.exists) ? 'DETECTED' : 'IDLE'}
                      </span>
                    </div>
                    <div className="p-2 rounded-lg bg-black/50 border border-white/5 flex items-center justify-between">
                      <span className="text-slate-300">Model Switcher:</span>
                      <span className={`px-1.5 py-0.2 rounded font-bold ${
                        (healingReport?.landmarks?.modelDropdownTrigger?.found ?? healingReport?.landmarks?.modelDropdownTrigger?.exists) ? 'text-emerald-400 bg-emerald-500/10' : 'text-slate-500 bg-white/5'
                      }`}>
                        {(healingReport?.landmarks?.modelDropdownTrigger?.found ?? healingReport?.landmarks?.modelDropdownTrigger?.exists) ? 'HEALTHY' : 'NONE'}
                      </span>
                    </div>
                    <div className="p-2 rounded-lg bg-black/50 border border-white/5 flex items-center justify-between col-span-2">
                      <span className="text-slate-300">Attachment Upload Flow:</span>
                      <span className={`px-1.5 py-0.2 rounded font-bold ${
                        !healingReport?.attachmentLandmarks || Object.keys(healingReport.attachmentLandmarks).length === 0
                          ? 'text-slate-500 bg-white/5'
                          : Object.values(healingReport.attachmentLandmarks).every((item: any) => item?.found)
                            ? 'text-emerald-400 bg-emerald-500/10'
                            : 'text-rose-400 bg-rose-500/10'
                      }`}>
                        {!healingReport?.attachmentLandmarks || Object.keys(healingReport.attachmentLandmarks).length === 0
                          ? 'NOT DECLARED'
                          : Object.values(healingReport.attachmentLandmarks).every((item: any) => item?.found) ? 'HEALTHY' : 'REPAIR NEEDED'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Recipe Versioning & Self-Healing Status */}
                <div className="p-3 rounded-xl bg-black/40 border border-white/5 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-mono uppercase text-slate-400 font-semibold flex items-center gap-1.5">
                      <Code className="w-3.5 h-3.5 text-cyan-400" />
                      Recipe Version &amp; Status:
                    </span>
                    <span className="text-[10.5px] font-mono px-2 py-0.5 rounded-full bg-cyan-500/10 text-cyan-300 border border-cyan-500/20 font-bold">
                      v{recipeInfo?.version || '1.0.0'}
                    </span>
                  </div>

                  <div className="text-[10px] font-mono text-slate-400 space-y-1 bg-black/30 p-2 rounded-lg border border-white/5">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-500">Origin / Type:</span>
                      <span className="text-slate-300">
                        {recipeInfo?.healedAt
                          ? `Healed via ${recipeInfo.healer || 'Local LLM'}`
                          : ['chatgpt', 'claude', 'gemini', 'grok'].includes(provider.id)
                          ? 'Default Pristine'
                          : 'Custom Recipe'}
                      </span>
                    </div>
                    {recipeInfo?.healedAt && (
                      <div className="flex items-center justify-between">
                        <span className="text-slate-500">Last Healed:</span>
                        <span className="text-emerald-400">
                          {new Date(recipeInfo.healedAt).toLocaleTimeString()}
                        </span>
                      </div>
                    )}
                    {Boolean(recipeInfo?.changelog && recipeInfo.changelog.length > 0) && (
                      <div className="mt-1 pt-1 border-t border-white/5">
                        <span className="text-[9.5px] text-slate-500 block mb-0.5">Latest changes:</span>
                        {recipeInfo?.changelog?.slice(-2).map((item: string, idx: number) => (
                          <div key={idx} className="text-[9px] text-slate-300 truncate">• {item}</div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Version Rollback & Reset Controls */}
                  <div className="flex items-center gap-2 pt-1">
                    {recipeHistory.length > 0 && (
                      <div className="flex-1 flex items-center gap-1.5">
                        <select
                          disabled={isRollbacking}
                          onChange={(e) => {
                            if (e.target.value) {
                              handleRollback(e.target.value);
                              e.target.value = '';
                            }
                          }}
                          defaultValue=""
                          className="w-full bg-black/60 border border-white/10 rounded-lg px-2 py-1 text-[9.5px] font-mono text-slate-300 focus:border-cyan-500/50 outline-none cursor-pointer"
                        >
                          <option value="" disabled>
                            {isRollbacking ? 'Rolling back...' : `Rollback (${recipeHistory.length} snapshot${recipeHistory.length > 1 ? 's' : ''})...`}
                          </option>
                          {recipeHistory.map((h, i) => (
                            <option key={i} value={h.version}>
                              Rollback to v{h.version} ({new Date(h.timestamp).toLocaleTimeString()})
                            </option>
                          ))}
                        </select>
                      </div>
                    )}

                    {Boolean(recipeInfo?.healedAt || ['chatgpt', 'claude', 'gemini', 'grok'].includes(provider.id)) && (
                      <button
                        onClick={handleResetToDefault}
                        disabled={isResetting || isHealing || (!recipeInfo?.healedAt && recipeHistory.length === 0)}
                        title="Discard local healed overrides and revert to original recipe"
                        className="px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/10 text-amber-300 border border-amber-500/30 text-[9.5px] font-mono transition-colors flex items-center gap-1 cursor-pointer shrink-0 disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        <RotateCcw className="w-3 h-3" />
                        <span>{isResetting ? 'Resetting...' : 'Reset to Default'}</span>
                      </button>
                    )}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center justify-end gap-2 pt-1">
                  <button
                    onClick={handleAudit}
                    disabled={isAuditing || isHealing}
                    className={`px-3 py-1.5 rounded-xl text-xs font-mono transition-colors ${
                      isAuditing ? 'bg-white/10 text-slate-400 cursor-wait' : 'bg-white/5 hover:bg-white/10 text-slate-300 border border-white/10 cursor-pointer'
                    }`}
                  >
                    {isAuditing ? 'Inspecting DOM...' : 'Audit Landmarks'}
                  </button>

                  <button
                    onClick={handleHeal}
                    disabled={isAuditing || isHealing || !localLLMConfig?.enabled}
                    title={!localLLMConfig?.enabled ? 'Local LLM is disabled. Enable Local LLM in Hub to repair DOM landmarks.' : undefined}
                    className={`px-3.5 py-1.5 rounded-xl text-xs font-mono font-bold transition-all shadow-[0_0_12px_rgba(249,115,22,0.3)] ${
                      !localLLMConfig?.enabled
                        ? 'bg-white/5 text-slate-500 border border-white/5 cursor-not-allowed shadow-none'
                        : isHealing
                        ? 'bg-orange-500/20 text-orange-300 cursor-wait'
                        : 'bg-orange-500 hover:bg-orange-400 text-black cursor-pointer'
                    }`}
                  >
                    {isHealing ? 'Repairing...' : 'Repair via Local LLM'}
                  </button>
                </div>
              </div>
            )}

            {/* Tab 2: Custom Recipe Wizard (3 Options + Direct JSON Import) */}
            {activeFlyoutTab === 'wizard' && (
              <div className="space-y-3">
                <div className="grid grid-cols-3 gap-2">
                  {/* Option 1: Agentic Preset */}
                  <div className="p-2.5 rounded-xl bg-black/40 border border-white/5 flex flex-col justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-1 text-slate-200 font-bold text-[11px]">
                        <Copy className="w-3.5 h-3.5 text-cyan-400" />
                        <span>1. Agentic Preset</span>
                      </div>
                      <p className="text-[9.5px] text-slate-400 mt-1 leading-tight">
                        Extracts DOM &amp; copies prompt for Claude/ChatGPT to generate JSON.
                      </p>
                    </div>
                    <button
                      onClick={handleCopyAgenticPrompt}
                      disabled={isCopyingPrompt}
                      className="w-full py-1.5 px-2 rounded-lg bg-white/5 hover:bg-white/10 text-cyan-300 border border-cyan-500/30 text-[10px] font-mono font-semibold transition-colors cursor-pointer"
                    >
                      {isCopyingPrompt ? 'Extracting...' : 'Copy Prompt'}
                    </button>
                  </div>

                  {/* Option 2: Local LLM Auto-Detect */}
                  <div className="p-2.5 rounded-xl bg-black/40 border border-white/5 flex flex-col justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-1 text-slate-200 font-bold text-[11px]">
                        <Sparkles className="w-3.5 h-3.5 text-orange-400" />
                        <span>2. Local LLM</span>
                      </div>
                      <p className="text-[9.5px] text-slate-400 mt-1 leading-tight">
                        Auto-analyzes active DOM using local LLM to detect selectors.
                      </p>
                    </div>
                    <button
                      onClick={handleDetectWithLocalLlm}
                      disabled={isDetectingRecipe || !localLLMConfig?.enabled}
                      title={!localLLMConfig?.enabled ? 'Enable Local LLM in Hub first' : undefined}
                      className={`w-full py-1.5 px-2 rounded-lg text-[10px] font-mono font-semibold transition-colors ${
                        !localLLMConfig?.enabled
                          ? 'bg-white/5 text-slate-500 border border-white/5 cursor-not-allowed'
                          : isDetectingRecipe
                          ? 'bg-orange-500/20 text-orange-300 cursor-wait'
                          : 'bg-orange-500/20 hover:bg-orange-500/30 text-orange-300 border border-orange-500/40 cursor-pointer'
                      }`}
                    >
                      {isDetectingRecipe ? 'Detecting...' : 'Auto-Detect'}
                    </button>
                  </div>

                  {/* Option 3: Visual Element Inspector */}
                  <div className="p-2.5 rounded-xl bg-black/40 border border-white/5 flex flex-col justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-1 text-slate-200 font-bold text-[11px]">
                        <Target className="w-3.5 h-3.5 text-emerald-400" />
                        <span>3. Visual Inspector</span>
                      </div>
                      <p className="text-[9.5px] text-slate-400 mt-1 leading-tight">
                        Point-and-click to map prompt, submit &amp; response elements in this view.
                      </p>
                    </div>
                    <button
                      onClick={handleLaunchVisualInspector}
                      className="w-full py-1.5 px-2 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/40 text-[10px] font-mono font-semibold transition-colors cursor-pointer"
                    >
                      Launch Inspector
                    </button>
                  </div>
                </div>

                {/* Direct JSON Import / Edit Area */}
                <div className="p-2.5 rounded-xl bg-black/40 border border-white/5 space-y-2">
                  <div className="flex items-center justify-between text-[10px] font-mono">
                    <span className="text-slate-300 font-semibold uppercase">Direct Recipe JSON Import:</span>
                    <label className="text-cyan-400 hover:text-cyan-300 cursor-pointer underline text-[9.5px]">
                      Upload .json
                      <input
                        type="file"
                        accept=".json"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (!file) return;
                          const r = new FileReader();
                          r.onload = (ev) => {
                            if (typeof ev.target?.result === 'string') {
                              setCustomRecipeJson(ev.target.result);
                            }
                          };
                          r.readAsText(file);
                        }}
                      />
                    </label>
                  </div>

                  <textarea
                    value={customRecipeJson}
                    onChange={(e) => setCustomRecipeJson(e.target.value)}
                    placeholder='Paste Custom Recipe JSON here (e.g. {"id": "my_ai", "selectors": {...}})...'
                    className="w-full h-20 bg-black/60 border border-white/10 rounded-lg p-2 font-mono text-[10px] text-slate-200 focus:outline-none focus:border-cyan-500 resize-none"
                  />

                  <div className="flex justify-end">
                    <button
                      onClick={handleImportCustomRecipe}
                      disabled={!customRecipeJson.trim()}
                      className="px-3 py-1 rounded-lg bg-cyan-500 hover:bg-cyan-400 disabled:bg-white/5 text-black disabled:text-slate-500 font-mono text-xs font-bold transition-colors cursor-pointer disabled:cursor-not-allowed"
                    >
                      Apply Custom Recipe
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Status Feedback Message */}
            {healingMsg && (
              <div className="p-2 rounded-lg bg-white/5 border border-white/10 text-[10.5px] font-mono text-cyan-300 animate-fade-in">
                {healingMsg}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
