import { CliServicesSettings } from './CliServicesSettings.js';
import React, { useState } from 'react';
import {
  ProviderConfig,
  ProviderId,
  ProviderStatus,
  RegistryStore,
  TransgenticConfig,
  ServicesManifest,
  TaskMode,
} from '../../shared/types.js';
import {
  ArrowLeft,
  FolderOpen,
  HardDrive,
  RefreshCw,
  Server,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Bot,
  Brain,
  Zap,
  Cpu,
  Check,
  ListCheck,
  X,
  CheckCircle2,
  Lock,
  FileCode,
  BookOpen,
  Copy,
  Terminal,
  Code2,
  PenTool,
  Image as ImageIcon,
  Video,
  Volume2,
  ChevronDown,
  ChevronUp,
  Timer,
  ShieldAlert,
  Gauge,
  History,
  MessageSquare,
  RotateCcw,
  GitBranch,
  Shield,
  Trash2,
  Plus,
  ExternalLink,
  Info,
  AlertCircle,
  AlertTriangle,
  Globe,
  Link,
  Folder,
  Wrench,
  Fingerprint,
  Cross,
  GitFork,
  ArrowRight,
  Pause,
  Pencil,
  Key,
  Braces,
} from 'lucide-react';
import { soundFx } from '../audio/soundFx.js';
import { getProviderTheme, getProviderDisplayName } from '../utils/providerTheme.js';
import { AuthModal } from './AuthModal.js';
import { DeleteProviderModal } from './DeleteProviderModal.js';
import { CLI_IDS, isCliProvider, type CliProviderId } from '../../shared/cli.js';

interface SettingsViewProps {
  initialTab?: SettingsTab;
  initialProvider?: ProviderId;
  config: TransgenticConfig;
  registry: RegistryStore;
  providers: Record<ProviderId, ProviderStatus>;
  servicesManifest?: ServicesManifest | null;
  healingReports?: Record<string, any>;
  onAuditProviderDom?: (providerId: ProviderId) => Promise<any>;
  onHealProviderDom?: (providerId: ProviderId) => Promise<any>;
  onUpdateHealingConfig?: (config: Partial<import('../../shared/types.js').HealingConfig>) => Promise<any>;
  onUpdateConfig?: (config: Partial<TransgenticConfig>) => Promise<any>;
  onToggleBalancedMode?: (enabled?: boolean) => Promise<any>;
  onToggleDoubleAgent?: (enabled?: boolean) => Promise<any>;
  onToggleDoubleAgentMode?: (mode: TaskMode, enabled?: boolean) => Promise<any>;
  onUpdateDoubleAgent?: (config: Partial<import('../../shared/types.js').DoubleAgentConfig>) => Promise<any>;
  onToggleAgentGuard?: (mode: TaskMode, enabled?: boolean) => Promise<any>;
  onUpdateRecallConfig?: (config: Partial<import('../../shared/types.js').RecallConfig>) => Promise<any>;
  onToggleRecallMode?: (mode: TaskMode, enabled?: boolean) => Promise<any>;
  onUpdateProviderConfig: (providerId: ProviderId, config: Partial<ProviderConfig>) => Promise<any>;
  onToggleModel: (providerId: ProviderId, modelId: string, enabled: boolean) => Promise<any>;
  onToggleService: (providerId: ProviderId, enabled: boolean) => Promise<any>;
  onToggleExperimentalService?: (serviceId: ProviderId, enabled: boolean) => Promise<any>;
  onAddCustomApiProvider?: (params: { name: string; baseUrl: string; apiKey?: string; defaultModelId?: string }) => Promise<any>;
  onUpdateCustomApiProvider?: (providerId: ProviderId, updates: { name?: string; baseUrl?: string; apiKey?: string; defaultModelId?: string }) => Promise<any>;
  onDeleteProvider?: (providerId: ProviderId) => Promise<any>;
  onUpdateServiceTitle?: (providerId: ProviderId, title: string) => Promise<any>;
  onInstallRecipe?: (recipe: any) => Promise<any>;
  onResyncModels: (providerId?: ProviderId) => Promise<any>;
  onSelectDirectory: () => Promise<string | null>;
  onApplyPort: (port: number) => Promise<{ success: boolean; port: number; error?: string }>;
  onApplyNetworkAccess?: (lanEnabled: boolean, advertisedAddress: string) => Promise<{ success: boolean; port: number; serverAccess?: { lanEnabled: boolean; advertisedAddress: string }; error?: string }>;
  onClearBrowserStorage?: () => Promise<any>;
  onPurgeAllLocalStorage?: () => Promise<any>;
  onOpenAuthModal?: () => void;
  onNavigateToRoutes?: (pipeline?: 'main' | 'co') => void;
  onBack?: () => void;
}

type SettingsTab = 'general' | 'models';
type ProviderCategory = 'webview' | 'api' | 'cli';
type ClientPlatform = 'codex' | 'cursor' | 'antigravity' | 'claude_desktop' | 'cli_stdio';

const loadProviderUiState = (): { category?: ProviderCategory; selections?: Partial<Record<ProviderCategory, ProviderId>> } => {
  try {
    const parsed = JSON.parse(window.localStorage.getItem('transgentic.providerUi') || '{}');
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch { return {}; }
};

export const SettingsView: React.FC<SettingsViewProps> = ({
  initialTab = 'general',
  initialProvider,
  config,
  registry,
  providers,
  servicesManifest,
  healingReports,
  onAuditProviderDom,
  onHealProviderDom,
  onUpdateHealingConfig,
  onUpdateConfig,
  onToggleBalancedMode,
  onToggleDoubleAgent,
  onToggleDoubleAgentMode,
  onUpdateDoubleAgent,
  onToggleAgentGuard,
  onUpdateRecallConfig,
  onToggleRecallMode,
  onUpdateProviderConfig,
  onToggleModel,
  onToggleService,
  onToggleExperimentalService,
  onAddCustomApiProvider,
  onUpdateCustomApiProvider,
  onDeleteProvider,
  onUpdateServiceTitle,
  onInstallRecipe,
  onResyncModels,
  onSelectDirectory,
  onApplyPort,
  onApplyNetworkAccess,
  onClearBrowserStorage,
  onPurgeAllLocalStorage,
  onOpenAuthModal,
  onNavigateToRoutes,
  onBack,
}) => {
  const [activeTab, setActiveTab] = useState<SettingsTab>(initialTab);
  const savedProviderUi = React.useMemo(loadProviderUiState, []);
  const categoryForProvider = (provider?: ProviderId): ProviderCategory => {
    if (provider && isCliProvider(provider)) return 'cli';
    const service = provider ? servicesManifest?.services?.[provider] : undefined;
    return service?.providerType === 'api' || provider?.startsWith('api_') ? 'api' : 'webview';
  };
  const initialCategory = initialProvider ? categoryForProvider(initialProvider) : savedProviderUi.category || 'webview';
  const initialSelections: Record<ProviderCategory, ProviderId> = {
    webview: savedProviderUi.selections?.webview || 'chatgpt',
    api: savedProviderUi.selections?.api || '',
    cli: savedProviderUi.selections?.cli || 'cli_codex',
  };
  if (initialProvider) initialSelections[initialCategory] = initialProvider;
  const [providerCategory, setProviderCategory] = useState<ProviderCategory>(initialCategory);
  const [selectedProvider, setSelectedProvider] = useState<ProviderId>(initialSelections[initialCategory]);
  const [selectedProviders, setSelectedProviders] = useState<Record<ProviderCategory, ProviderId>>(initialSelections);
  const [showExperimentalPage, setShowExperimentalPage] = useState<boolean>(false);
  const [moreProvidersTab, setMoreProvidersTab] = useState<'api' | 'webview'>('api');
  const [showApiForm, setShowApiForm] = useState<boolean>(false);
  const [editingApiId, setEditingApiId] = useState<ProviderId | null>(null);
  const [apiFormName, setApiFormName] = useState<string>('');
  const [apiFormBaseUrl, setApiFormBaseUrl] = useState<string>('');
  const [apiFormApiKey, setApiFormApiKey] = useState<string>('');
  const [apiFormModel, setApiFormModel] = useState<string>('');
  const [isSubmittingApi, setIsSubmittingApi] = useState<boolean>(false);
  const [apiFormError, setApiFormError] = useState<string | null>(null);
  const [editingWebviewId, setEditingWebviewId] = useState<ProviderId | null>(null);
  const [editingWebviewTitle, setEditingWebviewTitle] = useState<string>('');
  const [showWebviewForm, setShowWebviewForm] = useState<boolean>(false);
  const [webviewFormRecipeJson, setWebviewFormRecipeJson] = useState<string>('');
  const [webviewFormError, setWebviewFormError] = useState<string | null>(null);
  const [webviewFormSuccess, setWebviewFormSuccess] = useState<string | null>(null);
  const [isSubmittingWebview, setIsSubmittingWebview] = useState<boolean>(false);
  const [expandedServiceModels, setExpandedServiceModels] = useState<Record<string, boolean>>({});
  const [showAuthModalProvider, setShowAuthModalProvider] = useState<ProviderId | null>(null);
  const [selectedPlatform, setSelectedPlatform] = useState<ClientPlatform>('codex');
  const [portInput, setPortInput] = useState<string>(String(config.port || 58420));
  const [portStatus, setPortStatus] = useState<string>('');
  const [networkInterfaces, setNetworkInterfaces] = useState<Array<{ name: string; address: string }>>([]);
  const [lanEnabled, setLanEnabled] = useState(config.serverAccess?.lanEnabled === true);
  const [lanAddress, setLanAddress] = useState(config.serverAccess?.advertisedAddress || '');
  const [networkStatus, setNetworkStatus] = useState('');
  const [isApplyingNetwork, setIsApplyingNetwork] = useState(false);
  const [isResyncing, setIsResyncing] = useState<boolean>(false);
  const [resyncSuccess, setResyncSuccess] = useState<boolean>(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [showApiDocs, setShowApiDocs] = useState<boolean>(false);
  const [clientToken, setClientToken] = useState<string>('');
  const [isRegeneratingToken, setIsRegeneratingToken] = useState<boolean>(false);
  const [storageFeedback, setStorageFeedback] = useState<string | null>(null);
  const [isClearingBrowser, setIsClearingBrowser] = useState<boolean>(false);
  const [providerToDelete, setProviderToDelete] = useState<{ id: ProviderId; name?: string; isWebview?: boolean } | null>(null);
  const [isDeletingProvider, setIsDeletingProvider] = useState<boolean>(false);
  const isBalancedMode = config.balancedMode ?? config.coding?.balancedMode ?? true;

  React.useEffect(() => {
    try { window.localStorage.setItem('transgentic.providerUi', JSON.stringify({ category: providerCategory, selections: selectedProviders })); } catch {}
  }, [providerCategory, selectedProviders]);

  React.useEffect(() => {
    const fetchToken = async () => {
      if ((window as any).transgenticApi?.getMasterToken) {
        try {
          const t = await (window as any).transgenticApi.getMasterToken();
          setClientToken(t);
        } catch { }
      }
    };
    fetchToken();
    const unsub = (window as any).transgenticApi?.onTokenUpdated?.((t: string) => {
      setClientToken(t);
    });
    return () => unsub?.();
  }, []);

  React.useEffect(() => {
    void window.transgenticApi?.getNetworkInterfaces?.().then((items: Array<{ name: string; address: string }>) => {
      setNetworkInterfaces(items || []);
      if (!lanAddress && items?.[0]) setLanAddress(items[0].address);
    }).catch(() => {});
  }, []);

  React.useEffect(() => {
    const access = config.serverAccess;
    setLanEnabled(access?.lanEnabled === true);
    if (access?.advertisedAddress) setLanAddress(access.advertisedAddress);
  }, [config.serverAccess?.lanEnabled, config.serverAccess?.advertisedAddress]);

  const handleRegenerateToken = async () => {
    soundFx.playClick();
    if ((window as any).transgenticApi?.regenerateMasterToken) {
      setIsRegeneratingToken(true);
      try {
        const t = await (window as any).transgenticApi.regenerateMasterToken();
        setClientToken(t);
        soundFx.playTaskSuccess();
      } catch {
        soundFx.playWarnTone();
      } finally {
        setIsRegeneratingToken(false);
      }
    }
  };

  const [auditingProvider, setAuditingProvider] = useState<ProviderId | null>(null);
  const [healingProvider, setHealingProvider] = useState<ProviderId | null>(null);
  const [healingStatusMsg, setHealingStatusMsg] = useState<string | null>(null);

  const handleSaveApiProvider = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!apiFormName.trim() || !apiFormBaseUrl.trim()) {
      setApiFormError('Provider name and Base URL are required.');
      return;
    }
    setIsSubmittingApi(true);
    setApiFormError(null);
    try {
      if (editingApiId && onUpdateCustomApiProvider) {
        await onUpdateCustomApiProvider(editingApiId, {
          name: apiFormName.trim(),
          baseUrl: apiFormBaseUrl.trim(),
          apiKey: apiFormApiKey.trim() || undefined,
          defaultModelId: apiFormModel.trim() || undefined,
        });
      } else if (onAddCustomApiProvider) {
        const beforeIds = new Set(Object.keys(servicesManifest?.services || {}));
        const updated = await onAddCustomApiProvider({
          name: apiFormName.trim(),
          baseUrl: apiFormBaseUrl.trim(),
          apiKey: apiFormApiKey.trim() || undefined,
          defaultModelId: apiFormModel.trim() || undefined,
        });
        const createdId = Object.keys(updated?.services || {}).find(id => !beforeIds.has(id) && id.startsWith('api_')) as ProviderId | undefined;
        if (createdId) {
          setSelectedProvider(createdId);
          setSelectedProviders(previous => ({ ...previous, api: createdId }));
        }
      }
      setShowApiForm(false);
      setEditingApiId(null);
      setApiFormName('');
      setApiFormBaseUrl('');
      setApiFormApiKey('');
      setApiFormModel('');
    } catch (err: any) {
      setApiFormError(err?.message || 'Failed to save API provider');
    } finally {
      setIsSubmittingApi(false);
    }
  };

  const validateWebviewRecipeInput = (content: string) => {
    if (!content.trim()) {
      setWebviewFormError(null);
      setWebviewFormSuccess(null);
      return;
    }
    try {
      const parsed = JSON.parse(content);
      if (!parsed.id && !parsed.name && !parsed.title) {
        setWebviewFormError('Recipe must specify an "id" and "name" (or "title").');
        setWebviewFormSuccess(null);
      } else if (!parsed.domain && !parsed.domainMatch && !parsed.url) {
        setWebviewFormError('Recipe must specify a "domain" or "url".');
        setWebviewFormSuccess(null);
      } else {
        setWebviewFormError(null);
        setWebviewFormSuccess(`Valid Recipe Schema: "${parsed.name || parsed.title || parsed.id}"`);
      }
    } catch (err: any) {
      setWebviewFormError('Invalid JSON syntax: ' + err.message);
      setWebviewFormSuccess(null);
    }
  };

  const handleWebviewFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const content = ev.target?.result;
      if (typeof content === 'string') {
        setWebviewFormRecipeJson(content);
        validateWebviewRecipeInput(content);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleLoadRecipeTemplate = () => {
    soundFx.playClick();
    const template = {
      id: "custom_ai",
      name: "Custom AI Provider",
      version: "1.0.0",
      domain: "chat.example.com",
      url: "https://chat.example.com/",
      authStrategy: "cookie_sync",
      selectors: {
        inputPrompt: "#prompt-textarea, textarea, div[contenteditable='true'], div[role='textbox']",
        submitButton: "button[data-testid='send-button'], button[type='submit'], form button",
        responseContainer: "[data-role='assistant'], [data-message-author-role='assistant'], .response-turn",
        textResponse: ".response-content-markdown, .markdown, .prose, [data-testid='message-text']",
        stopButton: "button[data-testid='stop-button'], button[aria-label*='Stop' i]"
      },
      models: [
        {
          id: "default",
          displayName: "Default Model",
          mode: "general",
          modes: ["general", "coding"]
        }
      ]
    };
    const formatted = JSON.stringify(template, null, 2);
    setWebviewFormRecipeJson(formatted);
    validateWebviewRecipeInput(formatted);
  };

  const handleSaveWebviewRecipe = async () => {
    soundFx.playClick();
    if (!webviewFormRecipeJson.trim()) {
      setWebviewFormError('Recipe JSON is required.');
      return;
    }

    let parsed: any = null;
    try {
      parsed = JSON.parse(webviewFormRecipeJson);
    } catch (e: any) {
      setWebviewFormError('Invalid JSON syntax: ' + e.message);
      return;
    }

    setIsSubmittingWebview(true);
    setWebviewFormError(null);

    try {
      const api = (window as any).transgenticApi || (window as any).electronAPI;
      const installFn = onInstallRecipe || api?.installRecipe;
      if (!installFn) {
        throw new Error('Recipe installation API is unavailable in this context.');
      }

      const res = await installFn(parsed);
      if (res && (res.success || res.recipe)) {
        soundFx.playTaskSuccess();
        const targetHost = parsed.domain || (parsed.url ? (() => { try { return new URL(parsed.url).hostname; } catch { return ''; } })() : '') || 'the provider domain';
        setWebviewFormSuccess(
          `Recipe "${parsed.name || parsed.id}" installed! Navigate to ${targetHost} in Chrome to sync auth.`
        );
        setTimeout(() => {
          setShowWebviewForm(false);
          setWebviewFormRecipeJson('');
          setWebviewFormSuccess(null);
        }, 1600);
      } else {
        throw new Error(res?.error || 'Installation rejected by server.');
      }
    } catch (err: any) {
      soundFx.playWarnTone();
      setWebviewFormError(err?.message || 'Failed to install recipe');
    } finally {
      setIsSubmittingWebview(false);
    }
  };

  const handlePromptDeleteProvider = (providerId: ProviderId, name?: string, isWebview?: boolean) => {
    soundFx.playClick();
    const service = servicesManifest?.services?.[providerId];
    const displayName = name || service?.name || service?.company || providerId;
    setProviderToDelete({ id: providerId, name: displayName, isWebview });
  };

  const handleConfirmDeleteProvider = async () => {
    if (!providerToDelete) return;
    setIsDeletingProvider(true);
    try {
      const updated = onDeleteProvider ? await onDeleteProvider(providerToDelete.id) : undefined;
      if (selectedProvider === providerToDelete.id) {
        const remaining = (Object.values((updated?.services || {}) as Record<string, any>) as any[])
          .find(service => !service.hidden && (service.providerType === providerCategory || service.id.startsWith(`${providerCategory}_`)))?.id as ProviderId | undefined;
        const next = providerCategory === 'webview' ? remaining || 'chatgpt' : remaining || '';
        setSelectedProvider(next);
        setSelectedProviders(previous => ({ ...previous, [providerCategory]: next }));
      }
      setProviderToDelete(null);
    } catch (err) {
      console.error('Failed to delete provider:', err);
    } finally {
      setIsDeletingProvider(false);
    }
  };

  const handleSaveWebviewTitle = async (providerId: ProviderId) => {
    soundFx.playClick();
    if (editingWebviewTitle.trim() && onUpdateServiceTitle) {
      await onUpdateServiceTitle(providerId, editingWebviewTitle.trim());
    }
    setEditingWebviewId(null);
    setEditingWebviewTitle('');
  };


  const handleUpdateHealingConfig = async (updates: Partial<import('../../shared/types.js').HealingConfig>) => {
    soundFx.playClick();
    if (onUpdateHealingConfig) {
      await onUpdateHealingConfig(updates);
    }
  };

  const handleAuditProvider = async (pId: ProviderId) => {
    soundFx.playClick();
    if (!onAuditProviderDom) return;
    setAuditingProvider(pId);
    try {
      const res = await onAuditProviderDom(pId);
      const isHealthy = res?.allLandmarksHealthy ?? res?.healthy;
      if (isHealthy) {
        soundFx.playTaskSuccess();
        setHealingStatusMsg(`All control landmarks on ${pId.toUpperCase()} are healthy!`);
      } else {
        soundFx.playWarnTone();
        setHealingStatusMsg(`Discrepancies detected on ${pId.toUpperCase()}! Recommended: click Heal.`);
      }
      setTimeout(() => setHealingStatusMsg(null), 4000);
    } catch (err: any) {
      setHealingStatusMsg(`Audit failed: ${err?.message || err}`);
    } finally {
      setAuditingProvider(null);
    }
  };

  const handleHealProvider = async (pId: ProviderId) => {
    soundFx.playClick();
    if (!onHealProviderDom) return;
    setHealingProvider(pId);
    try {
      const res = await onHealProviderDom(pId);
      if (res?.success) {
        soundFx.playTaskSuccess();
        setHealingStatusMsg(`Successfully healed ${pId.toUpperCase()} via ${res.healedBy}!`);
      } else {
        soundFx.playWarnTone();
        setHealingStatusMsg(`Healing ${pId.toUpperCase()}: ${res?.error || 'Could not resolve new selectors'}`);
      }
      setTimeout(() => setHealingStatusMsg(null), 5000);
    } catch (err: any) {
      setHealingStatusMsg(`Healing failed: ${err?.message || err}`);
    } finally {
      setHealingProvider(null);
    }
  };

  // Rate Limiting & Execution Safeguards Local State
  const [cooldownSec, setCooldownSec] = useState<number>(Math.round((config.interMessageCooldownMs || 6000) / 1000));
  const [textJitterMin, setTextJitterMin] = useState<number>(Math.round((config.textJitterMinMs || 3000) / 1000));
  const [textJitterMax, setTextJitterMax] = useState<number>(Math.round((config.textJitterMaxMs || 8000) / 1000));

  const currentPort = config.port || 58420;
  const gatewayHost = lanEnabled && lanAddress ? lanAddress : '127.0.0.1';
  const completionBaseUrl = `http://${gatewayHost}:${currentPort}/v1`;
  const completionCurlExample = `curl ${completionBaseUrl}/chat/completions \\
  -H "Authorization: Bearer ${clientToken || 'YOUR_TOKEN'}" \\
  -H "Content-Type: application/json" \\
  -d '{"model":"transgentic/general","messages":[{"role":"user","content":"Hello"}]}'`;

  const currentProvConfig = registry[selectedProvider] || {
    serviceEnabled: true,
    activeSelectionMode: 'hybrid',
    allowMcpOverride: true,
    defaultModelId: 'gpt-4o',
    hourlyLimit: 30,
    cooldownSeconds: 6,
    models: [],
  };

  const copyToClipboard = (text: string, id: string) => {
    soundFx.playClick();
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2500);
  };

  const handleApplyPort = async () => {
    soundFx.playClick();
    const portNum = parseInt(portInput, 10);
    if (isNaN(portNum) || portNum < 1024 || portNum > 65535) {
      setPortStatus('Port must be between 1024 and 65535');
      return;
    }
    setPortStatus('Restarting MCP server...');
    const res = await onApplyPort(portNum);
    if (res.success) {
      soundFx.playTaskSuccess();
      setPortStatus(`Server restarted successfully on port ${res.port}`);
      setTimeout(() => setPortStatus(''), 3500);
    } else {
      soundFx.playWarnTone();
      setPortStatus(`Failed: ${res.error || 'Unknown error'}`);
    }
  };

  const applyNetworkSelection = async (nextEnabled: boolean, nextAddress: string) => {
    setIsApplyingNetwork(true);
    setNetworkStatus('Restarting gateway…');
    try {
      const result = await onApplyNetworkAccess?.(nextEnabled, nextAddress);
      if (!result?.success) throw new Error(result?.error || 'Could not apply network access.');
      const applied = result.serverAccess || { lanEnabled: nextEnabled, advertisedAddress: nextEnabled ? nextAddress : '' };
      setLanEnabled(applied.lanEnabled);
      if (applied.advertisedAddress) setLanAddress(applied.advertisedAddress);
      setNetworkStatus(applied.lanEnabled ? `Shared at http://${applied.advertisedAddress}:${result.port}` : `Local only at http://127.0.0.1:${result.port}`);
      soundFx.playTaskSuccess();
    } finally {
      setIsApplyingNetwork(false);
    }
  };

  const handleNetworkToggle = async (nextEnabled: boolean) => {
    if (isApplyingNetwork) return;
    soundFx.playClick();
    const previousEnabled = lanEnabled;
    const nextAddress = lanAddress || networkInterfaces[0]?.address || '';
    if (nextEnabled && !nextAddress) {
      setNetworkStatus('No local network address is available.');
      soundFx.playWarnTone();
      return;
    }
    setLanEnabled(nextEnabled);
    if (nextAddress) setLanAddress(nextAddress);
    try { await applyNetworkSelection(nextEnabled, nextAddress); }
    catch (error: any) {
      setLanEnabled(previousEnabled);
      setNetworkStatus(error?.message || 'Could not apply network access.');
      soundFx.playWarnTone();
    }
  };

  const handleNetworkAddressChange = async (nextAddress: string) => {
    if (isApplyingNetwork) return;
    soundFx.playClick();
    const previousAddress = lanAddress;
    setLanAddress(nextAddress);
    if (!lanEnabled) return;
    try { await applyNetworkSelection(true, nextAddress); }
    catch (error: any) {
      setLanAddress(previousAddress);
      setNetworkStatus(error?.message || 'Could not apply network access.');
      soundFx.playWarnTone();
    }
  };

  const handleSaveGuardrails = async () => {
    if (onUpdateConfig) {
      soundFx.playClick();
      await onUpdateConfig({
        interMessageCooldownMs: Math.max(1, cooldownSec) * 1000,
        textJitterMinMs: Math.max(1, textJitterMin) * 1000,
        textJitterMaxMs: Math.max(textJitterMin, textJitterMax) * 1000,
      });
      soundFx.playTaskSuccess();
    }
  };

  const handleSelectDirectory = async () => {
    soundFx.playClick();
    const path = await onSelectDirectory();
    if (path) {
      soundFx.playSuccessChime();
    }
  };

  const handleResync = async () => {
    soundFx.playClick();
    setIsResyncing(true);
    setResyncSuccess(false);
    try {
      await onResyncModels(selectedProvider);
      soundFx.playTaskSuccess();
      setResyncSuccess(true);
      setTimeout(() => setResyncSuccess(false), 3000);
    } catch {
      soundFx.playWarnTone();
    } finally {
      setIsResyncing(false);
    }
  };

  const handleToggleRecall = async (enabled: boolean) => {
    if (onUpdateRecallConfig) {
      await onUpdateRecallConfig({ enabled });
    } else if (onUpdateConfig) {
      await onUpdateConfig({
        recall: {
          ...(config.recall || { strategy: 'single-pass', autoTriggerKeywords: true }),
          enabled,
        },
      });
    }
  };

  const handleUpdateRecallStrategy = async (strategy: 'single-pass' | 'two-stage') => {
    if (onUpdateRecallConfig) {
      await onUpdateRecallConfig({ strategy });
    } else if (onUpdateConfig) {
      await onUpdateConfig({
        recall: {
          ...(config.recall || { enabled: true, autoTriggerKeywords: true }),
          strategy,
        },
      });
    }
  };

  const handleToggleRecallKeywords = async (autoTriggerKeywords: boolean) => {
    if (onUpdateRecallConfig) {
      await onUpdateRecallConfig({ autoTriggerKeywords });
    } else if (onUpdateConfig) {
      await onUpdateConfig({
        recall: {
          ...(config.recall || { enabled: true, strategy: 'single-pass' }),
          autoTriggerKeywords,
        },
      });
    }
  };

  const handleToggleRecallMode = async (mode: TaskMode, enabled: boolean) => {
    if (onToggleRecallMode) {
      await onToggleRecallMode(mode, enabled);
    } else {
      const currentModes = config.recall?.modes || {
        general: true,
        coding: true,
        writing: true,
        image: true,
        video: true,
        audio: true,
      };
      const updatedModes = {
        ...currentModes,
        [mode]: enabled,
      };
      if (onUpdateRecallConfig) {
        await onUpdateRecallConfig({ modes: updatedModes });
      } else if (onUpdateConfig) {
        await onUpdateConfig({
          recall: {
            ...(config.recall || { enabled: true, strategy: 'single-pass', autoTriggerKeywords: true }),
            modes: updatedModes,
          },
        });
      }
    }
  };

  const getProviderIcon = (id: ProviderId) => {
    const theme = getProviderTheme(id, servicesManifest?.services?.[id]);
    const Icon = theme.icon;
    return <Icon className={`w-4 h-4 ${theme.textClass}`} />;
  };

  const getProviderLabel = (id: ProviderId) => {
    return getProviderDisplayName(id, servicesManifest, providers);
  };

  // MCP Client Config Snippets
  const getClientSnippet = (platform: ClientPlatform) => {
    const tokenQuery = clientToken ? `?token=${clientToken}` : '';
    switch (platform) {
      case 'codex':
        return `# Codex TOML config (~/.codex/config.toml)
[mcp_servers.transgentic]
url = "http://127.0.0.1:${currentPort}/mcp"
http_headers = { "Authorization" = "Bearer ${clientToken || 'YOUR_TOKEN'}" }`;
      case 'cursor':
        return JSON.stringify(
          {
            mcpServers: {
              transgentic: {
                url: `http://127.0.0.1:${currentPort}/sse${tokenQuery}`,
              },
            },
          },
          null,
          2
        );
      case 'antigravity':
        return JSON.stringify(
          {
            mcpServers: {
              transgentic: {
                command: 'npx',
                args: ['-y', 'mcp-remote', `http://127.0.0.1:${currentPort}/sse${tokenQuery}`],
              },
            },
          },
          null,
          2
        );
      case 'claude_desktop':
        return JSON.stringify(
          {
            mcpServers: {
              transgentic: {
                command: 'npx',
                args: ['-y', 'mcp-remote', `http://127.0.0.1:${currentPort}/sse${tokenQuery}`],
              },
            },
          },
          null,
          2
        );
      case 'cli_stdio':
        return JSON.stringify(
          {
            mcpServers: {
              transgentic: {
                command: 'node',
                args: ['./bin/transgentic-cli.js'],
                env: {
                  TRANSGENTIC_PORT: String(currentPort),
                  TRANSGENTIC_TOKEN: clientToken || '',
                },
              },
            },
          },
          null,
          2
        );
    }
  };

  // MCP Client Configuration File Locations for macOS & Windows
  const getConfigLocationInfo = (platform: ClientPlatform) => {
    switch (platform) {
      case 'codex':
        return {
          title: 'Codex Config File Location (TOML)',
          macPath: '~/.codex/config.toml',
          winPath: '%USERPROFILE%\\.codex\\config.toml',
          instructions: 'In ~/.codex/config.toml add the [mcp_servers.transgentic] block with http_headers, or in Codex Settings → Plugins → MCPs set URL to http://127.0.0.1:' + currentPort + '/mcp and Add Header: Authorization = Bearer <token>.',
        };
      case 'cursor':
        return {
          title: 'Cursor IDE Config File Location',
          macPath: '.cursor/mcp.json (Project) or ~/Library/Application Support/Cursor/User/globalStorage/mcp.json',
          winPath: '.cursor\\mcp.json (Project) or %APPDATA%\\Cursor\\User\\globalStorage\\mcp.json',
          instructions: 'Create .cursor/mcp.json in workspace root, or go to Cursor Settings → Features → MCP → Add New MCP Server (Type: SSE, URL: http://127.0.0.1:' + currentPort + '/sse).',
        };
      case 'antigravity':
        return {
          title: 'Antigravity / Gemini MCP Config Location',
          macPath: '~/.gemini/config/mcp_config.json',
          winPath: '%USERPROFILE%\\.gemini\\config\\mcp_config.json',
          instructions: 'Add or merge the snippet inside the "mcpServers" key in ~/.gemini/config/mcp_config.json to expose multi-channel routing.',
        };
      case 'claude_desktop':
        return {
          title: 'Claude Desktop Config Location',
          macPath: '~/Library/Application Support/Claude/claude_desktop_config.json',
          winPath: '%APPDATA%\\Claude\\claude_desktop_config.json',
          instructions: 'Claude Desktop requires a stdio bridge (via `npx -y mcp-remote`) to connect to local SSE endpoints. Paste this snippet into claude_desktop_config.json and restart Claude Desktop.',
        };
      case 'cli_stdio':
        return {
          title: 'Transgentic CLI Stdio Bridge',
          macPath: 'Terminal: node ./bin/transgentic-cli.js (or npm link && transgentic-cli)',
          winPath: 'Command Prompt / PowerShell: node .\\bin\\transgentic-cli.js',
          instructions: 'Use the CLI binary for tools or IDEs that only support stdio-based MCP execution. The CLI automatically bridges JSON-RPC lines from stdin to the local Transgentic SSE daemon.',
        };
    }
  };

  const locationInfo = getConfigLocationInfo(selectedPlatform);

  return (
    <div className="h-full w-full flex flex-col p-4 overflow-y-auto space-y-4 no-drag max-h-full">
      {/* Header with clean 2 tabs */}
      <div className="flex items-center justify-between pb-1 border-b border-white/5">
        <div className="flex items-center gap-2">
          {onBack && (
            <button
              onClick={() => {
                soundFx.playClick();
                onBack();
              }}
              className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-slate-300 border border-white/10 transition-colors cursor-pointer"
              title="Back to Hub"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
            </button>
          )}
          <div>
            <h2 className="text-xs font-bold text-slate-100 uppercase tracking-wider flex items-center gap-1.5 font-mono">
              <SlidersHorizontal className="w-3.5 h-3.5 text-purple-400" />
              <span>Settings</span>
            </h2>
            <p className="text-[10px] text-slate-400">
              Manage pacing guardrails, local media storage, port, client setup, and models.
            </p>
          </div>
        </div>

        {/* Settings navigation */}
        <div className="flex items-center gap-1 bg-black/40 p-0.5 rounded-lg border border-white/5">
          <button
            onClick={() => {
              soundFx.playClick();
              setActiveTab('general');
            }}
            className={`px-2.5 py-1 rounded-md text-[10px] font-semibold flex items-center gap-1 transition-colors cursor-pointer ${activeTab === 'general'
                ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                : 'text-slate-400 hover:text-slate-200'
              }`}
          >
            <HardDrive className="w-3 h-3" />
            <span>General</span>
          </button>

          <button
            onClick={() => {
              soundFx.playClick();
              setActiveTab('models');
            }}
            className={`px-2.5 py-1 rounded-md text-[10px] font-semibold flex items-center gap-1 transition-colors cursor-pointer ${activeTab === 'models'
                ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                : 'text-slate-400 hover:text-slate-200'
              }`}
          >
            <Sparkles className="w-3 h-3" />
            <span>Providers</span>
          </button>
        </div>
      </div>

      {/* 1. GENERAL & STORAGE TAB */}
      {activeTab === 'general' && (
        <div className="space-y-4">
          {/* Balanced Mode Card */}
          <div className="tactile-core-card p-3.5 rounded-2xl border border-cyan-500/20 shadow-[0_0_20px_rgba(6,182,212,0.06)]">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 shadow-[0_0_12px_rgba(6,182,212,0.15)]">
                  <Zap className="w-4 h-4" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-slate-100 uppercase tracking-wide">
                      Balanced
                    </span>
                  </div>
                  <p className="text-[10px] text-slate-400 mt-0.5">
                    Standardizes reasoning and coding workflows across active AI providers with optimal fallbacks.
                  </p>
                </div>
              </div>

              {/* Balanced Mode Toggle */}
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={isBalancedMode}
                  onChange={(e) => {
                    soundFx.playClick();
                    if (onToggleBalancedMode) onToggleBalancedMode(e.target.checked);
                  }}
                  className="sr-only peer"
                />
                <div className="w-9 h-5 bg-slate-700/80 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-4 peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-cyan-500 relative border border-white/10 shadow-inner"></div>
                <span className={`text-[10px] font-mono font-semibold tracking-tight ${isBalancedMode ? 'text-cyan-300' : 'text-slate-400'
                  }`}>
                  {isBalancedMode ? 'ACTIVE' : 'DISABLED'}
                </span>
              </label>
            </div>
          </div>

          {/* Double Agent Card (Standalone) */}
          <div className="tactile-core-card p-3.5 rounded-2xl space-y-3.5 border border-amber-500/20 shadow-[0_0_20px_rgba(245,158,11,0.06)]">
            {/* Double Agent Master Header */}
            <div className="flex items-center justify-between pb-3 border-b border-white/5">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-400 shadow-[0_0_12px_rgba(245,158,11,0.15)]">
                  <Bot className="w-4 h-4" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-slate-100 uppercase tracking-wide">
                      Double Agent
                    </span>
                    <span className="text-[9px] font-mono text-amber-400 bg-amber-500/10 px-1.5 py-0.2 rounded border border-amber-500/20">
                      DUAL PIPELINE
                    </span>
                  </div>
                  <p className="text-[10px] text-slate-400 mt-0.5">
                    Concurrent cross-examination & co-pipeline routing for enhanced reasoning.
                  </p>
                </div>
              </div>

              {/* Double Agent Master Switch */}
              <label className="flex items-center gap-2 cursor-pointer select-none group">
                <input
                  type="checkbox"
                  checked={config.doubleAgent?.enabled ?? false}
                  onChange={(e) => {
                    soundFx.playClick();
                    if (onToggleDoubleAgent) onToggleDoubleAgent(e.target.checked);
                  }}
                  className="sr-only peer"
                />
                <div className="w-9 h-5 bg-slate-700/80 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-4 peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-amber-500 relative border border-white/10 shadow-inner group-hover:border-white/20 transition-colors"></div>
                <span className={`text-[10px] font-mono font-semibold tracking-tight ${config.doubleAgent?.enabled ? 'text-amber-300' : 'text-slate-500'
                  }`}>
                  {config.doubleAgent?.enabled ? 'ENABLED' : 'OFF'}
                </span>
              </label>
            </div>

            {/* Explanatory Block (Exact Quote as specified) */}
            <blockquote className="border-l-2 border-amber-500/40 pl-3 py-1.5 text-[10.5px] text-slate-300 font-sans leading-relaxed bg-amber-500/[0.03] rounded-r-lg">
              <p className="font-semibold text-amber-400/90 mb-0.5">Double Agent</p>
              When enabled with Balanced Mode, instructs your Agentic IDE to cross-examine its own reasoning against Transgentic. When enabled without Balanced Mode, Transgentic queries both your Main and Co providers concurrently, merging their perspectives.
            </blockquote>

            {/* Candidate Pool Options */}
            <div
              onClick={() => {
                const nextVal = !(config.doubleAgent?.includeLocalLlm ?? false);
                soundFx.playClick();
                if (onUpdateDoubleAgent) {
                  onUpdateDoubleAgent({ includeLocalLlm: nextVal });
                }
              }}
              className="p-2.5 rounded-xl bg-black/40 border border-white/5 hover:border-amber-500/30 hover:bg-black/60 transition-all cursor-pointer flex items-center justify-between select-none group"
            >
              <div className="flex items-center gap-2.5">
                <input
                  type="checkbox"
                  checked={config.doubleAgent?.includeLocalLlm ?? false}
                  onChange={(e) => {
                    e.stopPropagation();
                    soundFx.playClick();
                    if (onUpdateDoubleAgent) {
                      onUpdateDoubleAgent({ includeLocalLlm: e.target.checked });
                    }
                  }}
                  className="w-4 h-4 rounded border-slate-600 text-amber-500 focus:ring-0 focus:ring-offset-0 bg-black/60 cursor-pointer transition-colors"
                />
                <span className="text-[11px] font-medium text-slate-300 group-hover:text-slate-100 transition-colors">
                  Include Local LLM in Double Agent candidate pool
                </span>
              </div>
              <span className="text-[9.5px] text-slate-400 font-mono bg-white/[0.03] px-2 py-0.5 rounded border border-white/5">
                Restricted to text &amp; coding
              </span>
            </div>

            <div
              onClick={() => {
                soundFx.playClick();
                void onUpdateDoubleAgent?.({ completionReviewEnabled: !(config.doubleAgent?.completionReviewEnabled ?? false) });
              }}
              className={`flex cursor-pointer select-none items-center justify-between rounded-xl border p-2.5 transition-all ${config.doubleAgent?.completionReviewEnabled ? 'border-amber-500/35 bg-amber-500/10 shadow-[0_0_12px_rgba(245,158,11,0.08)]' : 'border-white/5 bg-black/40 hover:border-amber-500/25 hover:bg-black/60'}`}
            >
              <div className="min-w-0 pr-3">
                <div className="flex items-center gap-2">
                  <GitFork className={`h-3.5 w-3.5 shrink-0 ${config.doubleAgent?.completionReviewEnabled ? 'text-amber-300' : 'text-slate-500'}`} />
                  <span className="text-[11px] font-medium text-slate-200">Completion review pass</span>
                  <span className="rounded border border-amber-500/20 bg-amber-500/10 px-1.5 py-0.5 font-mono text-[8px] text-amber-300">TEXT ONLY</span>
                </div>
                <p className="mt-1 text-[9px] text-slate-500">Send `/v1` text answers through the Co route for a second pass. Requests with tools always stay direct.</p>
              </div>
              <label className="flex shrink-0 cursor-pointer items-center gap-2" onClick={event => event.stopPropagation()}>
                <input type="checkbox" checked={config.doubleAgent?.completionReviewEnabled ?? false} onChange={event => { soundFx.playClick(); void onUpdateDoubleAgent?.({ completionReviewEnabled: event.target.checked }); }} className="peer sr-only" />
                <span className="relative h-5 w-9 rounded-full border border-white/10 bg-slate-700/80 shadow-inner peer-checked:bg-amber-500 after:absolute after:left-[2px] after:top-[2px] after:h-4 after:w-4 after:rounded-full after:bg-white after:transition-transform peer-checked:after:translate-x-4" />
              </label>
            </div>

            {/* Active Double Agent Modes */}
            <div className="space-y-1.5 bg-black/40 p-2.5 rounded-xl border border-white/5">
              <div className="flex items-center justify-between">
                <label className="text-[10px] font-mono uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
                  <span>Active Double Agent Modes:</span>
                  <span className="text-[9px] text-amber-400 font-bold uppercase">
                    {Object.values(config.doubleAgent?.modes || { general: true, coding: true, writing: true, image: true, video: true, audio: true }).filter(Boolean).length}/6 Enabled
                  </span>
                </label>
              </div>
              <div className="grid grid-cols-6 gap-1.5 pt-1">
                {[
                  { mode: 'general' as TaskMode, label: 'General', icon: Sparkles },
                  { mode: 'coding' as TaskMode, label: 'Coding', icon: Code2 },
                  { mode: 'writing' as TaskMode, label: 'Writing', icon: PenTool },
                  { mode: 'image' as TaskMode, label: 'Image', icon: ImageIcon },
                  { mode: 'video' as TaskMode, label: 'Video', icon: Video },
                  { mode: 'audio' as TaskMode, label: 'Audio', icon: Volume2 },
                ].map(({ mode, label, icon: Icon }) => {
                  const isModeActive = config.doubleAgent?.modes
                    ? (config.doubleAgent.modes[mode] ?? true)
                    : true;
                  return (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => {
                        soundFx.playClick();
                        if (onToggleDoubleAgentMode) onToggleDoubleAgentMode(mode, !isModeActive);
                      }}
                      className={`flex flex-col items-center justify-center p-2 rounded-xl border transition-all cursor-pointer ${
                        isModeActive
                          ? 'bg-amber-500/20 border-amber-500/50 text-amber-300 shadow-[0_0_10px_rgba(245,158,11,0.2)]'
                          : 'bg-black/30 border-white/5 text-slate-400 hover:text-slate-200 hover:border-white/10'
                      }`}
                      title={`Toggle Double Agent for ${label} mode`}
                    >
                      <Icon className={`w-3.5 h-3.5 mb-1 ${isModeActive ? 'text-amber-400' : 'text-slate-500'}`} />
                      <span className="text-[10px] font-mono font-semibold">{label}</span>
                      <span className={`text-[8.5px] font-mono mt-0.5 ${isModeActive ? 'text-amber-400 font-bold' : 'text-slate-500'}`}>
                        {isModeActive ? 'ON' : 'OFF'}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Direct Link to Co-Agent Routes */}
            <div className="pt-2 border-t border-white/5 flex items-center justify-between">
              <span className="text-[10px] text-slate-400">
                Route matrices and fallback chains for the Co-Agent pipeline
              </span>
              <button
                type="button"
                onClick={() => {
                  soundFx.playClick();
                  if (onNavigateToRoutes) {
                    onNavigateToRoutes('co');
                  }
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 hover:border-amber-500/50 text-amber-300 hover:text-amber-200 text-xs font-mono font-semibold transition-all shadow-[0_0_12px_rgba(245,158,11,0.12)] cursor-pointer group"
              >
                <GitFork className="w-3.5 h-3.5 text-amber-400 group-hover:rotate-12 transition-transform" />
                <span>Co-Agent</span>
                <ArrowRight className="w-3 h-3 text-amber-400 group-hover:translate-x-0.5 transition-transform" />
              </button>
            </div>
          </div>

          {/* Agent Halt Guard Card */}
          <div className="tactile-core-card p-3.5 rounded-2xl space-y-3 border border-emerald-500/20 shadow-[0_0_15px_rgba(16,185,129,0.05)]">
            <div className="flex items-center justify-between pb-2 border-b border-white/5">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
                <div>
                  <span className="text-xs font-bold text-slate-100 uppercase tracking-wide">
                    Agent Halt Guard
                  </span>
                  <p className="text-[10px] text-slate-400">
                    Immediately halts execution and instructs Agentic IDEs (Codex, Antigravity, Claude Code) to stop if all provider fallbacks fail or rate-limit.
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-1 text-[9px] text-emerald-400 font-mono bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                <Pause className="w-3 h-3" />
                <span>Limit Agent</span>
              </div>
            </div>

            <div className="grid grid-cols-6 gap-1.5 pt-1">
              {[
                { mode: 'general' as TaskMode, label: 'General', icon: Sparkles },
                { mode: 'coding' as TaskMode, label: 'Coding', icon: Code2 },
                { mode: 'writing' as TaskMode, label: 'Writing', icon: PenTool },
                { mode: 'image' as TaskMode, label: 'Image', icon: ImageIcon },
                { mode: 'video' as TaskMode, label: 'Video', icon: Video },
                { mode: 'audio' as TaskMode, label: 'Audio', icon: Volume2 },
              ].map(({ mode, label, icon: Icon }) => {
                const isGuardActive = typeof config.agentHaltGuard === 'object' && config.agentHaltGuard !== null
                  ? (config.agentHaltGuard[mode] ?? true)
                  : (config.agentHaltGuard ?? true);
                return (
                  <button
                    key={mode}
                    onClick={() => {
                      soundFx.playClick();
                      if (onToggleAgentGuard) onToggleAgentGuard(mode, !isGuardActive);
                    }}
                    className={`flex flex-col items-center justify-center p-2 rounded-xl border transition-all cursor-pointer ${isGuardActive
                        ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-300 shadow-[0_0_10px_rgba(16,185,129,0.2)]'
                        : 'bg-black/30 border-white/5 text-slate-400 hover:text-slate-200 hover:border-white/10'
                      }`}
                    title={`Toggle Agent Guard for ${label} mode`}
                  >
                    <Icon className={`w-3.5 h-3.5 mb-1 ${isGuardActive ? 'text-emerald-400' : 'text-slate-500'}`} />
                    <span className="text-[10px] font-mono font-semibold">{label}</span>
                    <span className={`text-[8.5px] font-mono mt-0.5 ${isGuardActive ? 'text-emerald-400 font-bold' : 'text-slate-500'}`}>
                      {isGuardActive ? 'ON' : 'OFF'}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Recall & Context Memory Engine Card */}
          <div className="tactile-core-card p-3.5 rounded-2xl space-y-3 border border-purple-500/20 shadow-[0_0_15px_rgba(168,85,247,0.05)]">
            <div className="flex items-center justify-between pb-2 border-b border-white/5">
              <div className="flex items-center gap-2">
                <Brain className="w-4 h-4 text-purple-400" />
                <div>
                  <span className="text-xs font-bold text-slate-100 uppercase tracking-wide">
                    Recall & Context Memory
                  </span>
                  <p className="text-[10px] text-slate-400">
                    Instructs Web AI providers to search long-term memory, past chats, and user instructions.
                  </p>
                </div>
              </div>

              {/* Master Switch */}
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={config.recall?.enabled ?? true}
                  onChange={(e) => {
                    soundFx.playClick();
                    handleToggleRecall(e.target.checked);
                  }}
                  className="sr-only peer"
                />
                <div className="w-9 h-5 bg-slate-700/80 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-4 peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-purple-500 relative border border-white/10 shadow-inner"></div>
                <span className={`text-[10px] font-mono font-semibold tracking-tight ${(config.recall?.enabled ?? true) ? 'text-purple-300' : 'text-slate-400'
                  }`}>
                  {(config.recall?.enabled ?? true) ? 'ENABLED' : 'DISABLED'}
                </span>
              </label>
            </div>

            {/* Strategy Selector & Keyword Trigger */}
            <div className="grid grid-cols-2 gap-3 pt-1">
              {/* Retrieval Strategy */}
              <div className="space-y-1.5 bg-black/40 p-2.5 rounded-xl border border-white/5">
                <label className="text-[10px] font-mono uppercase tracking-wider text-slate-300 flex items-center justify-between">
                  <span>Retrieval Strategy:</span>
                  <span className="text-[9px] text-purple-400 font-bold uppercase">{config.recall?.strategy || 'single-pass'}</span>
                </label>
                <div className="grid grid-cols-2 gap-1 bg-black/50 p-1 rounded-lg border border-white/5">
                  <button
                    onClick={() => {
                      soundFx.playClick();
                      handleUpdateRecallStrategy('single-pass');
                    }}
                    className={`py-1 rounded-md text-[9.5px] font-mono font-semibold transition-all cursor-pointer ${(config.recall?.strategy ?? 'single-pass') === 'single-pass'
                        ? 'bg-purple-500/20 text-purple-300 border border-purple-500/40 shadow-[0_0_8px_rgba(168,85,247,0.2)]'
                        : 'text-slate-400 hover:text-slate-200'
                      }`}
                  >
                    Single-Pass
                  </button>
                  <button
                    onClick={() => {
                      soundFx.playClick();
                      handleUpdateRecallStrategy('two-stage');
                    }}
                    className={`py-1 rounded-md text-[9.5px] font-mono font-semibold transition-all cursor-pointer ${config.recall?.strategy === 'two-stage'
                        ? 'bg-purple-500/20 text-purple-300 border border-purple-500/40 shadow-[0_0_8px_rgba(168,85,247,0.2)]'
                        : 'text-slate-400 hover:text-slate-200'
                      }`}
                  >
                    Two-Stage
                  </button>
                </div>
                <p className="text-[9px] text-slate-500 font-sans">
                  {(config.recall?.strategy ?? 'single-pass') === 'single-pass'
                    ? 'Fastest execution. Injects directive directly above task payload.'
                    : 'Deep audit. Enforces two-phase memory audit and constraint reconciliation.'}
                </p>
              </div>

              {/* Auto Trigger & Memory Directives */}
              <div className="space-y-1.5 bg-black/40 p-2.5 rounded-xl border border-white/5">
                <label className="text-[10px] font-mono uppercase tracking-wider text-slate-300 flex items-center justify-between">
                  <span>Auto Context Triggers:</span>
                </label>
                <div className="flex items-center justify-between pt-1">
                  <span className="text-[11px] text-slate-300 font-sans">Automatic keywords detection</span>
                  <label className="cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={config.recall?.autoTriggerKeywords ?? true}
                      onChange={(e) => {
                        soundFx.playClick();
                        handleToggleRecallKeywords(e.target.checked);
                      }}
                      className="sr-only peer"
                    />
                    <div className="w-9 h-5 bg-slate-700/80 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-4 peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-purple-500 relative border border-white/10 shadow-inner"></div>
                  </label>
                </div>
                <p className="text-[9px] text-slate-500 font-sans">
                  Automatically checks prompts for historical references, constraints, and project lore.
                </p>
              </div>
            </div>

            <div className={`flex items-center justify-between rounded-xl border p-2.5 transition-all ${config.recall?.completionEnabled ? 'border-purple-500/35 bg-purple-500/10 shadow-[0_0_12px_rgba(168,85,247,0.08)]' : 'border-white/5 bg-black/40'}`}>
              <div className="min-w-0 pr-3">
                <div className="flex items-center gap-2">
                  <History className={`h-3.5 w-3.5 shrink-0 ${config.recall?.completionEnabled ? 'text-purple-300' : 'text-slate-500'}`} />
                  <span className="text-[11px] font-medium text-slate-200">Completion Recall</span>
                  <span className="rounded border border-purple-500/20 bg-purple-500/10 px-1.5 py-0.5 font-mono text-[8px] text-purple-300">TEXT ONLY</span>
                </div>
                <p className="mt-1 text-[9px] text-slate-500">Allow `/v1` text requests to use available provider memory. Requests with tools always stay direct.</p>
              </div>
              <label className="flex shrink-0 cursor-pointer items-center gap-2">
                <input type="checkbox" checked={config.recall?.completionEnabled ?? false} onChange={event => { soundFx.playClick(); void onUpdateRecallConfig?.({ completionEnabled: event.target.checked }); }} className="peer sr-only" />
                <span className="relative h-5 w-9 rounded-full border border-white/10 bg-slate-700/80 shadow-inner peer-checked:bg-purple-500 after:absolute after:left-[2px] after:top-[2px] after:h-4 after:w-4 after:rounded-full after:bg-white after:transition-transform peer-checked:after:translate-x-4" />
              </label>
            </div>

            {/* Active Recall Modes per Task */}
            <div className="space-y-1.5 bg-black/40 p-2.5 rounded-xl border border-white/5">
              <div className="flex items-center justify-between">
                <label className="text-[10px] font-mono uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
                  <span>Active Recall Modes:</span>
                  <span className="text-[9px] text-purple-400 font-bold uppercase">
                    {Object.values(config.recall?.modes || { general: true, coding: true, writing: true, image: true, video: true, audio: true }).filter(Boolean).length}/6 Enabled
                  </span>
                </label>
                <span className="text-[9px] text-slate-500 font-sans">
                  Per-mode recall directives
                </span>
              </div>

              <div className="grid grid-cols-6 gap-1.5 pt-1">
                {[
                  { mode: 'general' as TaskMode, label: 'General', icon: Sparkles },
                  { mode: 'coding' as TaskMode, label: 'Coding', icon: Code2 },
                  { mode: 'writing' as TaskMode, label: 'Writing', icon: PenTool },
                  { mode: 'image' as TaskMode, label: 'Image', icon: ImageIcon },
                  { mode: 'video' as TaskMode, label: 'Video', icon: Video },
                  { mode: 'audio' as TaskMode, label: 'Audio', icon: Volume2 },
                ].map(({ mode, label, icon: Icon }) => {
                  const isModeActive = config.recall?.modes ? (config.recall.modes[mode] ?? true) : true;
                  const isMasterEnabled = config.recall?.enabled ?? true;
                  const isEffective = isMasterEnabled && isModeActive;
                  return (
                    <button
                      key={mode}
                      onClick={() => {
                        soundFx.playClick();
                        handleToggleRecallMode(mode, !isModeActive);
                      }}
                      disabled={!isMasterEnabled}
                      className={`flex flex-col items-center justify-center p-2 rounded-xl border transition-all cursor-pointer ${!isMasterEnabled
                          ? 'opacity-40 border-white/5 bg-white/[0.02] text-slate-500 cursor-not-allowed'
                          : isEffective
                            ? 'bg-purple-500/20 border-purple-500/50 text-purple-300 shadow-[0_0_10px_rgba(168,85,247,0.2)]'
                            : 'bg-black/30 border-white/5 text-slate-400 hover:text-slate-200 hover:border-white/10'
                        }`}
                      title={`Toggle Recall for ${label} mode (${isEffective ? 'Active' : 'Disabled'})`}
                    >
                      <Icon className={`w-3.5 h-3.5 mb-1 ${isEffective ? 'text-purple-400' : 'text-slate-500'}`} />
                      <span className="text-[10px] font-mono font-semibold">{label}</span>
                      <span className={`text-[8.5px] font-mono mt-0.5 ${isEffective ? 'text-purple-400 font-bold' : 'text-slate-500'}`}>
                        {isEffective ? 'ON' : 'OFF'}
                      </span>
                    </button>
                  );
                })}
              </div>
              <p className="text-[9px] text-slate-500 font-sans pt-0.5">
                Automatically injects memory search directives specifically when executing tasks under enabled modes (excludes Local LLM).
              </p>
            </div>
          </div>

          {/* Rate-Limiting & Operational Guardrails */}
          <div className="tactile-core-card p-3.5 rounded-2xl space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-white/5">
              <div className="flex items-center gap-2">
                <ShieldAlert className="w-4 h-4 text-emerald-400" />
                <div>
                  <span className="text-xs font-bold text-slate-100 uppercase tracking-wide">
                    Rate-Limiting & Operational Guardrails
                  </span>
                  <p className="text-[10px] text-slate-400">
                    Advisory delay buffers to pace automated agent requests and adhere to provider hourly limits.
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-1 text-[9px] text-emerald-400 font-mono bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                <ShieldCheck className="w-3 h-3" />
                <span>Active Safeguards</span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 pt-1">
              {/* Inter-Message Cooldown */}
              <div className="space-y-1 bg-black/40 p-2.5 rounded-xl border border-white/5">
                <div className="flex items-center justify-between">
                  <label className="text-[10px] font-mono uppercase tracking-wider text-slate-300 flex items-center gap-1">
                    <Timer className="w-3 h-3 text-cyan-400" />
                    <span>Inter-Message Cooldown:</span>
                  </label>
                  <span className="text-xs font-mono font-bold text-cyan-300">{cooldownSec}s</span>
                </div>
                <input
                  type="range"
                  min="2"
                  max="15"
                  value={cooldownSec}
                  onChange={(e) => setCooldownSec(parseInt(e.target.value, 10))}
                  onMouseUp={handleSaveGuardrails}
                  className="w-full accent-cyan-400 h-1.5 bg-black/50 rounded-lg cursor-pointer"
                />
                <p className="text-[9px] text-slate-500 font-sans">
                  Enforces minimum rest between consecutive requests to break infinite loops.
                </p>
              </div>

              {/* Human Simulation Random Delay (Jitter) */}
              <div className="space-y-1 bg-black/40 p-2.5 rounded-xl border border-white/5">
                <div className="flex items-center justify-between">
                  <label className="text-[10px] font-mono uppercase tracking-wider text-slate-300 flex items-center gap-1">
                    <Gauge className="w-3 h-3 text-purple-400" />
                    <span>Human Timing Jitter:</span>
                  </label>
                  <span className="text-xs font-mono font-bold text-purple-300 whitespace-nowrap">{textJitterMin}s - {textJitterMax}s</span>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min="1"
                    max="10"
                    value={textJitterMin}
                    onChange={(e) => {
                      const val = parseInt(e.target.value, 10) || 1;
                      setTextJitterMin(val);
                    }}
                    onBlur={handleSaveGuardrails}
                    className="w-1/2 bg-black/50 border border-white/10 rounded-lg px-2 py-1 text-xs text-purple-300 font-mono text-center"
                    placeholder="Min (3s)"
                  />
                  <span className="text-[10px] text-slate-500 font-mono">to</span>
                  <input
                    type="number"
                    min="2"
                    max="30"
                    value={textJitterMax}
                    onChange={(e) => {
                      const val = parseInt(e.target.value, 10) || 2;
                      setTextJitterMax(val);
                    }}
                    onBlur={handleSaveGuardrails}
                    className="w-1/2 bg-black/50 border border-white/10 rounded-lg px-2 py-1 text-xs text-purple-300 font-mono text-center"
                    placeholder="Max (8s)"
                  />
                </div>
                <p className="text-[9px] text-slate-500 font-sans">
                  Simulates realistic human thinking and typing delays before prompt dispatch.
                </p>
              </div>
            </div>
          </div>

          {/* DOM Self-Healing & Watchdog Engine Card (Orange Theme) */}
          <div className="tactile-core-card p-3.5 rounded-2xl space-y-3 border border-orange-500/25 shadow-[0_0_20px_rgba(249,115,22,0.08)]">
            <div className="flex items-center justify-between pb-2 border-b border-white/5">
              <div className="flex items-center gap-2">
                <Wrench className="w-4 h-4 text-orange-400" />
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-slate-100 uppercase tracking-wide">
                      DOM Self-Healing & Watchdog
                    </span>
                  </div>
                  <p className="text-[10px] text-slate-400">
                    On-demand DOM landmark auditing and local selector repair.
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-1 text-[9px] text-blue-400 font-mono bg-blue-500/10 px-2 py-0.5 rounded-full border border-blue-500/20">
                <Cross className="w-3 h-3" />
                <span>Health Check</span>
              </div>
            </div>

            {/* Informational Callout Notice */}
            <div className="p-2.5 rounded-xl bg-orange-950/20 border border-orange-500/30 flex items-start gap-2 text-[10.5px] leading-relaxed text-orange-200">
              <ShieldAlert className="w-4 h-4 text-orange-400 shrink-0 mt-0.5" />
              <div>
                <strong className="text-orange-300">Local LLM Exclusive Engine (On-Demand):</strong> DOM selector repair operates <strong>exclusively via your Local LLM (Ollama / LM Studio)</strong> on-demand. Cloud AI services (Claude, ChatGPT) strictly prohibit reverse-engineering competing web interfaces due to safety policies, ensuring all DOM inspection and repair remains private and compliant.
              </div>
            </div>

            {/* Local LLM Disabled Warning */}
            {!config.localLLM?.enabled && (
              <div className="p-2.5 rounded-xl bg-amber-950/20 border border-amber-500/30 flex items-center justify-between text-[10.5px] text-amber-200">
                <div className="flex items-center gap-1.5">
                  <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                  <span>Local LLM is currently disabled. Enable Local LLM in the Hub to repair DOM landmarks.</span>
                </div>
              </div>
            )}

            {/* Configuration Parameters */}
            <div className="grid grid-cols-1 gap-2.5 pt-1">
              {/* Monitor Model Switcher */}
              <div className="p-2 rounded-xl bg-black/40 border border-white/5 flex items-center justify-between">
                <div>
                  <span className="text-[10px] font-mono uppercase text-slate-300 block font-semibold">Model Switcher Scope</span>
                  <span className="text-[8.5px] text-slate-500">Inspect model dropdown button/badge landmarks</span>
                </div>
                <input
                  type="checkbox"
                  checked={config.healing?.checkModelSelector ?? true}
                  onChange={(e) => handleUpdateHealingConfig({ checkModelSelector: e.target.checked })}
                  className="rounded border-slate-700 text-orange-500 focus:ring-orange-500/20 bg-black/50"
                />
              </div>
            </div>

            {/* Provider Landmark Monitor Status & Action Triggers */}
            <div className="space-y-2 pt-1">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400">
                  Monitored Control Landmarks (Input, Submit, Stop, Model Switcher):
                </span>
                {healingStatusMsg && (
                  <span className="text-[10px] font-mono text-orange-300 animate-pulse">
                    {healingStatusMsg}
                  </span>
                )}
              </div>

              <div className="space-y-1.5">
                {(['chatgpt', 'claude', 'gemini', 'grok'] as ProviderId[]).map((pId) => {
                  const report = healingReports?.[pId];
                  const landmarks = report?.landmarks;
                  const isAuditing = auditingProvider === pId;
                  const isHealing = healingProvider === pId;
                  const ProviderIcon = getProviderTheme(pId).icon;

                  return (
                    <div
                      key={pId}
                      className="p-2.5 rounded-xl bg-black/40 border border-white/5 flex items-center justify-between"
                    >
                      <div className="flex items-center gap-2.5">
                        <div className="p-1 rounded-lg bg-white/5 border border-white/10 text-slate-300">
                          <ProviderIcon className="w-4 h-4" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-slate-200 font-mono uppercase">
                              {pId}
                            </span>
                            {report ? (
                              (report.allLandmarksHealthy ?? report.healthy) ? (
                                <span className="text-[8.5px] font-mono px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                                  ALL HEALTHY
                                </span>
                              ) : (
                                <span className="text-[8.5px] font-mono px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
                                  ISSUES DETECTED
                                </span>
                              )
                            ) : (
                              <span className="text-[8.5px] font-mono px-1.5 py-0.2 rounded bg-white/5 text-slate-500">
                                UNINSPECTED
                              </span>
                            )}
                          </div>

                          {/* 4 Landmarks badges */}
                          <div className="flex items-center gap-1 mt-1 text-[9px] font-mono">
                            {(() => {
                              const renderLandmarkBadge = (name: string, found: boolean, isHealed: boolean) => {
                                if (isHealed) {
                                  return (
                                    <span className="pl-0.5 pr-1 py-0.5 rounded border flex items-center gap-0.5 bg-orange-500/20 text-orange-300 border-orange-500/40">
                                      <ListCheck className="w-2.5 h-2.5 shrink-0" />
                                      <span>{name}</span>
                                    </span>
                                  );
                                }
                                if (found) {
                                  return (
                                    <span className="pl-0.5 pr-1 py-0.5 rounded border flex items-center gap-0.5 bg-emerald-500/10 text-emerald-400 border-emerald-500/20">
                                      <Check className="w-2.5 h-2.5 shrink-0" />
                                      <span>{name}</span>
                                    </span>
                                  );
                                }
                                return (
                                  <span className="pl-0.5 pr-1 py-0.5 rounded border flex items-center gap-0.5 bg-rose-500/10 text-rose-400 border-rose-500/20">
                                    <X className="w-2.5 h-2.5 shrink-0" />
                                    <span>{name}</span>
                                  </span>
                                );
                              };

                              const inputFound = Boolean(landmarks?.inputPrompt?.found ?? landmarks?.inputPrompt?.exists);
                              const inputHealed = Boolean(landmarks?.inputPrompt?.activeSelector);

                              const submitFound = Boolean(landmarks?.submitButton?.found ?? landmarks?.submitButton?.exists);
                              const submitHealed = Boolean(landmarks?.submitButton?.activeSelector);

                              const stopFound = Boolean(landmarks?.stopButton?.found ?? landmarks?.stopButton?.exists);
                              const stopHealed = Boolean(landmarks?.stopButton?.activeSelector);

                              const switcherFound = Boolean(landmarks?.modelDropdownTrigger?.found ?? landmarks?.modelDropdownTrigger?.exists);
                              const switcherHealed = Boolean(landmarks?.modelDropdownTrigger?.activeSelector);

                              return (
                                <>
                                  {renderLandmarkBadge('input', inputFound, inputHealed)}
                                  {renderLandmarkBadge('submit', submitFound, submitHealed)}
                                  {renderLandmarkBadge('stop', stopFound, stopHealed)}
                                  {renderLandmarkBadge('switcher', switcherFound, switcherHealed)}
                                </>
                              );
                            })()}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => handleAuditProvider(pId)}
                          disabled={isAuditing || isHealing}
                          className={`px-2.5 py-1 rounded-lg text-[10px] font-mono transition-colors ${isAuditing
                              ? 'bg-white/10 text-slate-400 cursor-wait'
                              : 'bg-white/5 hover:bg-orange-500/10 text-slate-300 hover:text-orange-200 border border-white/10 hover:border-orange-500/30 cursor-pointer'
                            }`}
                        >
                          {isAuditing ? 'Checking...' : 'Check'}
                        </button>
                        <button
                          onClick={() => handleHealProvider(pId)}
                          disabled={isAuditing || isHealing || !config.localLLM?.enabled}
                          title={!config.localLLM?.enabled ? 'Local LLM is disabled. Enable Local LLM in Hub to repair DOM landmarks.' : undefined}
                          className={`px-2.5 py-1 rounded-lg text-[10px] font-mono font-semibold transition-all ${!config.localLLM?.enabled
                              ? 'bg-white/5 text-slate-500 border border-white/5 cursor-not-allowed'
                              : isHealing
                                ? 'bg-orange-500/20 text-orange-300 cursor-wait'
                                : 'bg-orange-500/20 hover:bg-orange-500/30 text-orange-300 border border-orange-500/40 shadow-[0_0_8px_rgba(249,115,22,0.25)] cursor-pointer'
                            }`}
                        >
                          {isHealing ? 'Healing...' : 'Heal'}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* MCP Client Security & Access Token Management */}
          <div className="tactile-core-card p-3.5 rounded-2xl space-y-3 border border-cyan-500/20 shadow-[0_0_15px_rgba(6,182,212,0.05)]">
            <div className="flex items-center justify-between pb-2 border-b border-white/5">
              <div className="flex items-center gap-2">
                <Lock className="w-4 h-4 text-cyan-400" />
                <div>
                  <span className="text-xs font-bold text-slate-100 uppercase tracking-wide">
                    MCP Client Security & Authentication
                  </span>
                  <p className="text-[10px] text-slate-400">
                    Loopback authentication token required for all incoming MCP connections.
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-1 text-[9px] text-cyan-400 font-mono bg-cyan-500/10 px-2 py-0.5 rounded-full border border-cyan-500/20">
                <ShieldCheck className="w-3 h-3" />
                <span>Protected</span>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] font-mono uppercase tracking-wider text-slate-400 flex items-center justify-between">
                <span>Master Client Access Token:</span>
                <span className="text-cyan-400 text-[9px] font-mono">Bearer Token</span>
              </label>

              <div className="flex items-center gap-2">
                <div className="flex-1 relative">
                  <input
                    type="text"
                    readOnly
                    value={clientToken || 'Loading token...'}
                    className="w-full bg-black/50 border border-white/10 rounded-xl px-3 py-1.5 text-xs text-cyan-300 font-mono focus:outline-none select-all"
                  />
                </div>

                <button
                  onClick={() => copyToClipboard(clientToken, 'settings-token')}
                  className="px-3 py-1.5 rounded-xl bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300 border border-cyan-500/40 text-xs font-semibold transition-all flex items-center gap-1 cursor-pointer"
                  title="Copy Master Token"
                >
                  {copiedId === 'settings-token' ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                      <span className="text-emerald-400">Copied</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      <span>Copy</span>
                    </>
                  )}
                </button>

                <button
                  onClick={handleRegenerateToken}
                  disabled={isRegeneratingToken}
                  className="px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 border border-white/10 text-xs font-semibold transition-colors flex items-center gap-1 cursor-pointer"
                  title="Regenerate Token"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isRegeneratingToken ? 'animate-spin' : ''}`} />
                  <span>Regenerate</span>
                </button>

                {onOpenAuthModal && (
                  <button
                    onClick={onOpenAuthModal}
                    className="px-3 py-1.5 rounded-xl bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 text-xs font-semibold transition-colors flex items-center gap-1 cursor-pointer"
                    title="Open Setup Onboarding Dialog"
                  >
                    <span>View Setup</span>
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* MCP Port Config Card */}
          <div className="tactile-core-card p-3.5 rounded-2xl space-y-3">
            <div className="flex items-center gap-2 pb-2 border-b border-white/5">
              <Server className="w-4 h-4 text-cyan-400" />
              <div>
                <span className="text-xs font-bold text-slate-100 uppercase tracking-wide">
                  Gateway Port & Network
                </span>
                <p className="text-[10px] text-slate-400">
                  One authenticated port for MCP and OpenAI-compatible completion.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <div className="flex-1 relative">
                <input
                  type="number"
                  value={portInput}
                  onChange={(e) => setPortInput(e.target.value)}
                  className="w-full bg-black/50 border border-white/10 rounded-xl px-3 py-1.5 text-xs text-cyan-300 font-mono focus:outline-none focus:border-cyan-500/50"
                  placeholder="58420"
                />
              </div>

              <button
                onClick={handleApplyPort}
                className="px-3.5 py-1.5 rounded-xl bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300 border border-cyan-500/40 text-xs font-semibold transition-all shadow-[0_0_10px_rgba(6,182,212,0.15)] cursor-pointer"
              >
                Apply & Restart
              </button>
            </div>

            {portStatus && (
              <div className="text-[10px] font-mono text-cyan-400 bg-cyan-500/10 px-2.5 py-1 rounded-lg border border-cyan-500/20">
                {portStatus}
              </div>
            )}
            <div className="space-y-2 border-t border-white/[0.06] pt-3">
              <label className={`flex items-center justify-between rounded-xl border border-white/[0.07] bg-black/25 px-3 py-2.5 ${isApplyingNetwork ? 'cursor-wait opacity-65' : 'cursor-pointer'}`}><div><div className="text-[10.5px] font-semibold text-slate-200">Share on local network</div><div className="text-[9.5px] text-slate-500">Changes apply immediately. Remote clients must use the access token.</div></div><input type="checkbox" className="sr-only peer" checked={lanEnabled} disabled={isApplyingNetwork} onChange={event => void handleNetworkToggle(event.target.checked)} /><span className="relative h-5 w-9 rounded-full border border-white/10 bg-slate-800 peer-checked:bg-cyan-500/70 after:absolute after:left-[2px] after:top-[2px] after:h-3.5 after:w-3.5 after:rounded-full after:bg-white after:transition-transform peer-checked:after:translate-x-4" /></label>
              {lanEnabled && <select value={lanAddress} disabled={isApplyingNetwork} onChange={event => void handleNetworkAddressChange(event.target.value)} className="w-full rounded-xl border border-cyan-500/20 bg-black/40 px-3 py-2 text-[10.5px] font-mono text-cyan-200 outline-none focus:border-cyan-500/50 disabled:cursor-wait disabled:opacity-60">{networkInterfaces.map(item => <option key={`${item.name}-${item.address}`} value={item.address}>{item.name} · {item.address}</option>)}</select>}
              <div className="rounded-xl border border-white/[0.06] bg-black/25 px-3 py-2 font-mono text-[9.5px] text-slate-400">Completion: http://{gatewayHost}:{currentPort}/v1<br />MCP: http://{gatewayHost}:{currentPort}/mcp<br />SSE: http://{gatewayHost}:{currentPort}/sse</div>
              {networkStatus && <div className="rounded-lg border border-cyan-500/15 bg-cyan-500/[0.06] px-2.5 py-1.5 text-[9.5px] font-mono text-cyan-300">{networkStatus}</div>}
            </div>
          </div>

          {/* Local Media & File Storage Management */}
          <div className="tactile-core-card p-3.5 rounded-2xl space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-white/5">
              <div className="flex items-center gap-2">
                <HardDrive className="w-4 h-4 text-purple-400" />
                <div>
                  <span className="text-xs font-bold text-slate-100 uppercase tracking-wide">
                    Local Media File Storage
                  </span>
                  <p className="text-[10px] text-slate-400">
                    100% local storing in Documents folder for generated images, videos, and audio.
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-1 text-[9px] text-emerald-400 font-mono bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                <ShieldCheck className="w-3 h-3" />
                <span>Zero Base64 in Context</span>
              </div>
            </div>

            {/* Current Storage Directory Path */}
            <div className="space-y-1.5">
              <label className="text-[10px] font-mono uppercase tracking-wider text-slate-400">
                Active Storage Directory:
              </label>
              <div className="flex items-center gap-2">
                <div className="flex-1 bg-black/50 border border-white/10 rounded-xl px-3 py-2 text-[11px] text-slate-200 font-mono overflow-x-auto select-all">
                  {config.assetsDir || '~/Documents/Transgentic'}
                </div>

                <button
                  onClick={handleSelectDirectory}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-purple-500/20 hover:bg-purple-500/30 text-purple-300 border border-purple-500/40 text-xs font-semibold transition-all shadow-[0_0_10px_rgba(168,85,247,0.15)] cursor-pointer shrink-0"
                >
                  <FolderOpen className="w-3.5 h-3.5" />
                  <span>Browse...</span>
                </button>
              </div>
            </div>

            {/* Architectural Guardrail & Directory Structure Notice */}
            <div className="bg-black/30 border border-white/5 rounded-xl p-2.5 text-[10px] text-slate-400 space-y-2">
              <div className="font-semibold text-slate-300 flex items-center gap-1">
                <FileCode className="w-3 h-3 text-cyan-400" />
                <span>Local Storage Architecture &amp; Intermediary Protocol</span>
              </div>
              <p>
                Transgentic cleanly organizes your assets and recipes locally into dedicated directories:
              </p>
              <div className="grid grid-cols-2 gap-2 text-[9.5px] font-mono">
                <div className="p-2 rounded-lg bg-black/40 border border-white/5 space-y-0.5">
                  <span className="text-purple-300 font-bold block">Library/</span>
                  <span className="text-slate-400 block">• Images/</span>
                  <span className="text-slate-400 block">• Videos/</span>
                  <span className="text-slate-400 block">• Audios/</span>
                </div>
                <div className="p-2 rounded-lg bg-black/40 border border-white/5 space-y-0.5">
                  <span className="text-cyan-300 font-bold block">Recipes/</span>
                  <span className="text-slate-400 block">• Custom/ (user-added)</span>
                  <span className="text-slate-400 block">• Healed/ (self-repaired overrides)</span>
                  <span className="text-slate-400 block">• History/ (version snapshots)</span>
                </div>
              </div>
              <p className="text-[9px] text-slate-500">
                Media files are saved locally and returned as short relative paths to MCP clients. Built-in recipes remain immutable in the repo, while self-healing overrides and version rollback snapshots are safely maintained in your local directory.
              </p>
            </div>
          </div>

          {/* Browser Storage & Privacy Clearance Card (Uninstall Cleanup) */}
          <div className="tactile-core-card p-3.5 rounded-2xl space-y-3 border border-amber-500/20 shadow-[0_0_15px_rgba(245,158,11,0.05)]">
            <div className="flex items-center justify-between pb-2 border-b border-white/5">
              <div className="flex items-center gap-2">
                <Shield className="w-4 h-4 text-amber-400" />
                <div>
                  <span className="text-xs font-bold text-slate-100 uppercase tracking-wide">
                    Browser Cookies, Storage & Data
                  </span>
                  <p className="text-[10px] text-slate-400">
                    Purge cookies, session tokens, and cached web data across all AI service partitions.
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-1 text-[9px] text-amber-400 font-mono bg-amber-500/10 px-2 py-0.5 rounded-full border border-amber-500/20">
                <Fingerprint className="w-3 h-3" />
                <span>Privacy Reset</span>
              </div>

            </div>

            <div className="bg-black/30 border border-white/5 rounded-xl p-2.5 text-[10px] text-slate-400 leading-relaxed space-y-1">
              <p>
                Transgentic isolates each AI provider in dedicated Electron partition directories (<code className="text-cyan-300 font-mono">persist:transgentic_*</code>). If you plan to uninstall the application or want to reset all website logins and cached tokens, use the buttons below.
              </p>
            </div>

            {storageFeedback && (
              <div className="text-[10.5px] font-medium text-emerald-300 bg-emerald-500/10 border border-emerald-500/30 p-2.5 rounded-xl flex items-center gap-2">
                <Check className="w-3.5 h-3.5 shrink-0" />
                <span>{storageFeedback}</span>
              </div>
            )}

            <div className="flex items-center gap-2.5 pt-1">
              <button
                onClick={async () => {
                  soundFx.playClick();
                  if (onClearBrowserStorage) {
                    setIsClearingBrowser(true);
                    try {
                      const res = await onClearBrowserStorage();
                      setStorageFeedback(`Purged cookies & storage across ${res?.clearedPartitions || 4} browser partitions.`);
                    } catch (e: any) {
                      setStorageFeedback(`Cleared browser storage: ${e.message || 'Done'}`);
                    } finally {
                      setIsClearingBrowser(false);
                      setTimeout(() => setStorageFeedback(null), 5000);
                    }
                  }
                }}
                disabled={isClearingBrowser}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-cyan-500/15 hover:bg-cyan-500/25 text-cyan-300 border border-cyan-500/30 text-xs font-semibold transition-all cursor-pointer shadow-[0_0_10px_rgba(6,182,212,0.1)]"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isClearingBrowser ? 'animate-spin' : ''}`} />
                <span>Purge Browser</span>
              </button>

              <button
                onClick={async () => {
                  soundFx.playClick();
                  if (onPurgeAllLocalStorage) {
                    setIsClearingBrowser(true);
                    try {
                      await onPurgeAllLocalStorage();
                      setStorageFeedback('All local storage, memory vault, thread sessions, and browser partitions purged.');
                    } catch (e: any) {
                      setStorageFeedback(`Purge complete: ${e.message || 'Done'}`);
                    } finally {
                      setIsClearingBrowser(false);
                      setTimeout(() => setStorageFeedback(null), 5000);
                    }
                  }
                }}
                disabled={isClearingBrowser}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 border border-rose-500/30 text-xs font-semibold transition-all cursor-pointer shadow-[0_0_10px_rgba(244,63,94,0.1)]"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Reset Entirely</span>
              </button>
            </div>
          </div>

          {/* Quick MCP Client Configuration Card with Config Locations */}
          <div className="tactile-core-card p-3.5 rounded-2xl space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-white/5">
              <div className="flex items-center gap-2">
                <Terminal className="w-4 h-4 text-cyan-400" />
                <div>
                  <span className="text-xs font-bold text-slate-100 uppercase tracking-wide">
                    Connect Any MCP Client
                  </span>
                  <p className="text-[10px] text-slate-400">
                    Paste this snippet into your IDE or agent config to connect immediately.
                  </p>
                </div>
              </div>
            </div>

            {/* Platform Selector Buttons */}
            <div className="grid grid-cols-5 gap-1 bg-black/40 p-1 rounded-xl border border-white/5">
              {(['codex', 'cursor', 'antigravity', 'claude_desktop', 'cli_stdio'] as ClientPlatform[]).map((p) => (
                <button
                  key={p}
                  onClick={() => {
                    soundFx.playClick();
                    setSelectedPlatform(p);
                  }}
                  className={`py-1 rounded-lg text-[9.5px] font-semibold uppercase tracking-wider transition-all cursor-pointer ${selectedPlatform === p
                      ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                      : 'text-slate-400 hover:text-slate-200'
                    }`}
                >
                  {p === 'claude_desktop' ? 'Claude' : p === 'cli_stdio' ? 'CLI Stdio' : p.toUpperCase()}
                </button>
              ))}
            </div>

            {/* Code Snippet Box with Copy Button */}
            <div className="relative bg-black/60 border border-white/10 rounded-xl p-3 font-mono text-[11px] text-cyan-300">
              <pre className="overflow-x-auto selection:bg-cyan-500 selection:text-black">
                {getClientSnippet(selectedPlatform)}
              </pre>

              <button
                onClick={() => copyToClipboard(getClientSnippet(selectedPlatform), 'quick-config')}
                className="absolute top-2.5 right-2.5 flex items-center gap-1 px-2 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-slate-200 border border-white/10 text-[10px] transition-colors cursor-pointer"
              >
                {copiedId === 'quick-config' ? (
                  <>
                    <Check className="w-3 h-3 text-emerald-400" />
                    <span className="text-emerald-400 font-bold">Copied!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3 h-3 text-slate-300" />
                    <span>Copy Config</span>
                  </>
                )}
              </button>
            </div>

            {/* Platform Config File Paths (macOS & Windows) */}
            <div className="bg-black/30 border border-white/5 rounded-xl p-3 space-y-2 text-[10px] font-mono">
              <div className="flex items-center gap-1.5 text-slate-300 font-bold font-sans">
                <Folder className="w-3.5 h-3.5 text-cyan-400" />
                <span>{locationInfo.title}</span>
              </div>

              <div className="space-y-1.5 text-slate-400 font-sans">
                <p>{locationInfo.instructions}</p>
              </div>

              <div className="space-y-1 pt-1 border-t border-white/5 font-mono text-[9.5px]">
                {/* macOS Path */}
                <div className="flex items-center justify-between p-1.5 rounded-lg bg-white/5 border border-white/5">
                  <div className="flex items-center gap-1.5 overflow-hidden">
                    <span className="text-slate-400 font-semibold uppercase shrink-0">macOS / Linux:</span>
                    <span className="text-cyan-300 truncate select-all">{locationInfo.macPath}</span>
                  </div>
                  <button
                    onClick={() => copyToClipboard(locationInfo.macPath, 'mac-path')}
                    className="px-1.5 py-0.5 rounded bg-white/10 hover:bg-white/20 text-slate-300 text-[9px] shrink-0 ml-1 cursor-pointer"
                    title="Copy macOS Path"
                  >
                    {copiedId === 'mac-path' ? 'Copied' : 'Copy'}
                  </button>
                </div>

                {/* Windows Path */}
                <div className="flex items-center justify-between p-1.5 rounded-lg bg-white/5 border border-white/5">
                  <div className="flex items-center gap-1.5 overflow-hidden">
                    <span className="text-slate-400 font-semibold uppercase shrink-0">Windows:</span>
                    <span className="text-purple-300 truncate select-all">{locationInfo.winPath}</span>
                  </div>
                  <button
                    onClick={() => copyToClipboard(locationInfo.winPath, 'win-path')}
                    className="px-1.5 py-0.5 rounded bg-white/10 hover:bg-white/20 text-slate-300 text-[9px] shrink-0 ml-1 cursor-pointer"
                    title="Copy Windows Path"
                  >
                    {copiedId === 'win-path' ? 'Copied' : 'Copy'}
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Full API Developer Documentation Accordion */}
          <div className="tactile-core-card p-3.5 rounded-2xl space-y-3">
            <button
              onClick={() => {
                soundFx.playClick();
                setShowApiDocs(!showApiDocs);
              }}
              className="w-full flex items-center justify-between text-left cursor-pointer"
            >
              <div className="flex items-center gap-2">
                <BookOpen className="w-4 h-4 text-purple-400" />
                <div>
                  <span className="text-xs font-bold text-slate-100 uppercase tracking-wide">
                    Developer API & Integration Documentation
                  </span>
                  <p className="text-[10px] text-slate-400">
                    Full technical reference for integrating Transgentic into custom apps & scripts.
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-purple-500/10 text-purple-300 border border-purple-500/30 text-[10px] font-mono">
                <span>{showApiDocs ? 'Hide Docs' : 'View Full Docs'}</span>
                {showApiDocs ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
              </div>
            </button>

            {showApiDocs && (
              <div className="space-y-4 pt-3 border-t border-white/5">
                {/* 1. OpenAI-compatible completion API */}
                <div className="space-y-2">
                  <span className="flex items-center gap-1 text-xs font-bold uppercase text-slate-200 font-mono">
                    <Braces className="h-3.5 w-3.5 text-cyan-400" />
                    <span>1. OpenAI-Compatible Completion API</span>
                  </span>

                  <p className="text-[10px] leading-relaxed text-slate-400">
                    Use Transgentic as the primary model provider for Cline or any OpenAI-compatible client. Routes select the backend while the client keeps its conversation history, project files, commands, and tool execution.
                  </p>

                  <div className="space-y-1.5 text-[11px] font-mono">
                    <div className="flex items-center justify-between rounded-xl border border-white/5 bg-black/40 p-2.5">
                      <div className="min-w-0"><span className="font-bold text-cyan-300">Base URL</span><p className="truncate text-[10px] text-slate-400">{completionBaseUrl}</p></div>
                      <button onClick={() => copyToClipboard(completionBaseUrl, 'completion-base')} className="ml-2 shrink-0 rounded bg-white/10 px-2 py-1 text-[10px] text-slate-200 transition-colors hover:bg-white/20">{copiedId === 'completion-base' ? 'Copied!' : 'Copy URL'}</button>
                    </div>
                    <div className="flex items-center justify-between rounded-xl border border-white/5 bg-black/40 p-2.5">
                      <div><span className="font-bold text-emerald-300">GET /v1/models</span><p className="mt-0.5 text-[10px] text-slate-400 font-sans">Lists route models and eligible direct providers.</p></div>
                      <button onClick={() => copyToClipboard(`${completionBaseUrl}/models`, 'completion-models')} className="ml-2 shrink-0 rounded bg-white/10 px-2 py-1 text-[10px] text-slate-200 transition-colors hover:bg-white/20">{copiedId === 'completion-models' ? 'Copied!' : 'Copy URL'}</button>
                    </div>
                    <div className="rounded-xl border border-white/5 bg-black/40 p-2.5">
                      <span className="font-bold text-purple-300">POST /v1/chat/completions</span>
                      <p className="mt-0.5 text-[10px] text-slate-400 font-sans">Accepts OpenAI chat messages, tools, tool results, and <code className="font-mono text-cyan-300">stream: true</code>. Tool calls are returned to the client and are never executed by the completion gateway.</p>
                    </div>
                  </div>

                  <div className="rounded-xl border border-cyan-500/15 bg-cyan-500/[0.045] p-2.5">
                    <div className="flex flex-wrap gap-1.5 font-mono text-[9px]">
                      {['transgentic/general', 'transgentic/coding', 'transgentic/writing'].map(model => <span key={model} className="rounded-md border border-cyan-500/20 bg-cyan-500/10 px-1.5 py-0.5 text-cyan-300">{model}</span>)}
                    </div>
                    <p className="mt-2 text-[9.5px] leading-relaxed text-slate-400">Send <code className="text-cyan-300">Authorization: Bearer &lt;access token&gt;</code>. Provider Mode CLIs can appear in the model list; Agentic Mode CLIs remain available through MCP.</p>
                  </div>

                  <div className="relative rounded-xl border border-white/10 bg-black/60 p-3 font-mono text-[9.5px] text-cyan-300">
                    <pre className="overflow-x-auto pr-16 selection:bg-cyan-500 selection:text-black">{completionCurlExample}</pre>
                    <button onClick={() => copyToClipboard(completionCurlExample, 'completion-curl')} className="absolute right-2.5 top-2.5 rounded border border-white/10 bg-white/10 px-2 py-1 text-[9px] text-slate-200 transition-colors hover:bg-white/20">{copiedId === 'completion-curl' ? 'Copied!' : 'Copy'}</button>
                  </div>
                </div>

                {/* 2. SSE Endpoints */}
                <div className="space-y-2">
                  <span className="text-xs font-bold text-slate-200 uppercase font-mono flex items-center gap-1">
                    <Server className="w-3.5 h-3.5 text-cyan-400" />
                    <span>2. SSE Transport Endpoints</span>
                  </span>

                  <div className="space-y-1.5 text-[11px] font-mono">
                    <div className="p-2.5 rounded-xl bg-black/40 border border-white/5 flex items-center justify-between">
                      <div>
                        <span className="text-cyan-300 font-bold">GET /sse</span>
                        <p className="text-[10px] text-slate-400 font-sans mt-0.5">
                          Unified Multi-Model Gateway with auto-failover and data blinding.
                        </p>
                      </div>
                      <button
                        onClick={() => copyToClipboard(`http://127.0.0.1:${currentPort}/sse?token=${clientToken || 'YOUR_TOKEN'}`, 'ep-unified')}
                        className="px-2 py-1 rounded bg-white/10 hover:bg-white/20 text-slate-200 text-[10px] transition-colors cursor-pointer"
                      >
                        {copiedId === 'ep-unified' ? 'Copied!' : 'Copy URL'}
                      </button>
                    </div>

                    <div className="p-2.5 rounded-xl bg-black/40 border border-white/5 flex items-center justify-between">
                      <div>
                        <span className="text-amber-300 font-bold">GET /claude/sse</span>
                        <p className="text-[10px] text-slate-400 font-sans mt-0.5">
                          Dedicated direct Claude 3.5 Sonnet / Opus endpoint.
                        </p>
                      </div>
                      <button
                        onClick={() => copyToClipboard(`http://127.0.0.1:${currentPort}/claude/sse?token=${clientToken || 'YOUR_TOKEN'}`, 'ep-claude')}
                        className="px-2 py-1 rounded bg-white/10 hover:bg-white/20 text-slate-200 text-[10px] transition-colors cursor-pointer"
                      >
                        {copiedId === 'ep-claude' ? 'Copied!' : 'Copy URL'}
                      </button>
                    </div>

                    <div className="p-2.5 rounded-xl bg-black/40 border border-white/5 flex items-center justify-between">
                      <div>
                        <span className="text-emerald-300 font-bold">GET /chatgpt/sse</span>
                        <p className="text-[10px] text-slate-400 font-sans mt-0.5">
                          Dedicated direct ChatGPT (GPT-4o, o1, o3-mini) endpoint.
                        </p>
                      </div>
                      <button
                        onClick={() => copyToClipboard(`http://127.0.0.1:${currentPort}/chatgpt/sse?token=${clientToken || 'YOUR_TOKEN'}`, 'ep-chatgpt')}
                        className="px-2 py-1 rounded bg-white/10 hover:bg-white/20 text-slate-200 text-[10px] transition-colors cursor-pointer"
                      >
                        {copiedId === 'ep-chatgpt' ? 'Copied!' : 'Copy URL'}
                      </button>
                    </div>
                  </div>
                </div>

                {/* 3. MCP Tools Specification */}
                <div className="space-y-2">
                  <span className="text-xs font-bold text-slate-200 uppercase font-mono flex items-center gap-1">
                    <Code2 className="w-3.5 h-3.5 text-emerald-400" />
                    <span>3. Exposed MCP Tools</span>
                  </span>

                  <div className="space-y-2 text-[11px]">
                    <div className="bg-black/40 p-2.5 rounded-xl border border-white/5 space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="font-mono text-cyan-300 font-bold">prompt_model</span>
                        <span className="text-[9px] font-mono text-emerald-400 bg-emerald-500/10 px-1.5 py-0.2 rounded border border-emerald-500/20">
                          Primary Router
                        </span>
                      </div>
                      <p className="text-slate-400 text-[10px]">
                        Orchestrates prompts with secret blinding, multi-turn thread mapping, rate-limit fallback chains, and smart model selection.
                      </p>
                      <div className="font-mono text-[9px] text-slate-300 bg-black/50 p-2 rounded border border-white/5 space-y-0.5">
                        <div>• <b>prompt</b> (string, required): The prompt to execute.</div>
                        <div>• <b>mode</b> (enum): general | coding | writing | image | video | audio</div>
                        <div>• <b>provider</b> (enum): chatgpt | claude | gemini | grok</div>
                        <div>• <b>model</b> (string): e.g. 'gpt-4o', 'o1', 'claude-3-5-sonnet', 'grok-3'</div>
                        <div>• <b>threadId</b> (string): Conversation session ID for stateful multi-turn memory.</div>
                        <div>• <b>newThread</b> (boolean): Force fresh conversation session creation.</div>
                        <div>• <b>projectName</b> (string): Workspace or thread name.</div>
                      </div>
                    </div>

                    <div className="bg-black/40 p-2.5 rounded-xl border border-white/5 space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="font-mono text-purple-300 font-bold">generate_image / generate_video / generate_audio</span>
                        <span className="text-[9px] font-mono text-purple-400 bg-purple-500/10 px-1.5 py-0.2 rounded border border-purple-500/20 whitespace-nowrap">
                          Local Disk Assets
                        </span>
                      </div>
                      <p className="text-slate-400 text-[10px]">
                        Generates media and downloads files 100% locally to disk, returning only short local file paths.
                      </p>
                    </div>
                  </div>
                </div>

                {/* 4. Thread Mapping & Session Persistence System */}
                <div className="space-y-2.5">
                  <span className="text-xs font-bold text-slate-200 uppercase font-mono flex items-center gap-1.5">
                    <History className="w-3.5 h-3.5 text-purple-400" />
                    <span>4. Thread Mapping & Multi-Turn Session Persistence</span>
                  </span>

                  <div className="space-y-2 text-[11px]">
                    <div className="bg-black/40 p-3 rounded-xl border border-white/5 space-y-2.5">
                      <div className="flex items-center justify-between">
                        <span className="font-mono text-purple-300 font-bold flex items-center gap-1.5">
                          <MessageSquare className="w-3.5 h-3.5 text-purple-400" />
                          <span>Stateful Web Conversation Continuity</span>
                        </span>
                        <span className="text-[9px] font-mono text-purple-300 bg-purple-500/10 px-2 py-0.5 rounded border border-purple-500/20">
                          24h TTL • Auto URL Binding
                        </span>
                      </div>

                      <p className="text-slate-300 text-[10.5px] leading-relaxed font-sans">
                        Transgentic bridges stateless MCP client tool calls into persistent, multi-turn AI web sessions. When your app supplies a <code className="text-cyan-300 font-mono">threadId</code>, Transgentic captures the resulting conversation URL from the provider's web session and re-navigates to that exact URL on subsequent turns.
                      </p>

                      {/* Key Parameters Table */}
                      <div className="space-y-1.5">
                        <div className="text-[9px] font-mono uppercase tracking-wider text-slate-400 font-semibold">
                          Threading Parameters for <code className="text-cyan-400 lowercase">prompt_model</code>
                        </div>
                        <div className="font-mono text-[9.5px] text-slate-200 bg-black/60 p-2.5 rounded-lg border border-white/5 space-y-1.5">
                          <div>
                            <span className="text-cyan-300 font-bold">threadId</span> (string, optional):
                            <span className="text-slate-400"> Unique identifier for the conversation session (e.g. <code className="text-purple-300">'user_session_42'</code> or <code className="text-purple-300">'task_refactor_auth'</code>). Subsequent requests with the same <code className="text-cyan-300">threadId</code> will continue the same active web conversation turn.</span>
                          </div>
                          <div>
                            <span className="text-amber-300 font-bold">newThread</span> (boolean, optional, default: <code className="text-slate-400">false</code>):
                            <span className="text-slate-400"> Pass <code className="text-emerald-300">true</code> to force Transgentic to navigate to a fresh new chat session and bind the new conversation URL to the specified <code className="text-cyan-300">threadId</code>.</span>
                          </div>
                          <div>
                            <span className="text-purple-300 font-bold">projectName</span> (string, optional):
                            <span className="text-slate-400"> Workspace or project namespace. If <code className="text-cyan-300">threadId</code> is omitted, Transgentic automatically generates a fallback session key based on <code className="text-purple-300">'project_' + projectName</code>.</span>
                          </div>
                        </div>
                      </div>

                      {/* Architecture & Flow Highlights */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-0.5">
                        <div className="p-2.5 rounded-lg bg-white/[0.02] border border-white/5 space-y-1">
                          <span className="text-[10px] font-mono font-bold text-cyan-300 flex items-center gap-1.5">
                            <GitBranch className="w-3 h-3 text-cyan-400" />
                            <span>Provider Isolation</span>
                          </span>
                          <p className="text-[9.5px] text-slate-400 leading-normal font-sans">
                            Sessions are stored as composite keys (<code className="text-slate-300 font-mono">provider:threadId</code>). The same <code className="text-slate-300 font-mono">threadId</code> can be used across multiple AI providers independently without collision.
                          </p>
                        </div>

                        <div className="p-2.5 rounded-lg bg-white/[0.02] border border-white/5 space-y-1">
                          <span className="text-[10px] font-mono font-bold text-emerald-300 flex items-center gap-1.5">
                            <RotateCcw className="w-3 h-3 text-emerald-400" />
                            <span>Context Preservation</span>
                          </span>
                          <p className="text-[9.5px] text-slate-400 leading-normal font-sans">
                            All previous code snippets, system context, and artifacts in the conversation remain intact in the provider's web session, eliminating redundant re-prompting.
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* 5. Dedicated Task Mode Endpoints */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-200 uppercase font-mono flex items-center gap-1.5">
                      <SlidersHorizontal className="w-3.5 h-3.5 text-cyan-400" />
                      <span>5. Dedicated Task Mode Endpoints (Pre-Locked Modes)</span>
                    </span>
                    <span className="text-[9px] font-mono text-cyan-400 bg-cyan-500/10 px-2 py-0.5 rounded border border-cyan-500/20">
                      Auto-Locked Task Modes
                    </span>
                  </div>

                  <p className="text-[10px] text-slate-400 leading-relaxed font-sans">
                    For agentic IDEs, custom storyboard tools, or automation scripts that target specific workflows without relying on runtime auto-classification. Connecting to these dedicated endpoints pre-locks the task mode:
                  </p>

                  <div className="space-y-2 text-[11px] font-mono">
                    {/* Image & Storyboard */}
                    <div className="p-2.5 rounded-xl bg-black/40 border border-white/5 space-y-1.5">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <ImageIcon className="w-3.5 h-3.5 text-pink-400" />
                          <span className="text-pink-300 font-bold">GET /image/sse</span>
                        </div>
                        <button
                          onClick={() => copyToClipboard(`http://127.0.0.1:${currentPort}/image/sse?token=${clientToken || 'YOUR_TOKEN'}`, 'ep-mode-image')}
                          className="px-2 py-0.5 rounded bg-white/10 hover:bg-white/20 text-slate-200 text-[10px] transition-colors cursor-pointer"
                        >
                          {copiedId === 'ep-mode-image' ? 'Copied!' : 'Copy URL'}
                        </button>
                      </div>
                      <div className="flex items-center justify-between text-[10px] text-slate-400 font-sans">
                        <span><strong className="text-slate-200 font-normal">Image & Storyboard Generation</strong> <span className="font-mono text-slate-300 text-[9.5px]">(gpt-image-2, Grok Imagine, DALL-E)</span></span>
                        <span className="text-[9px] font-mono text-pink-400 bg-pink-500/10 px-1.5 py-0.2 rounded border border-pink-500/20">Local Disk PNG</span>
                      </div>
                    </div>

                    {/* Video Generation */}
                    <div className="p-2.5 rounded-xl bg-black/40 border border-white/5 space-y-1.5">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Video className="w-3.5 h-3.5 text-purple-400" />
                          <span className="text-purple-300 font-bold">GET /video/sse</span>
                        </div>
                        <button
                          onClick={() => copyToClipboard(`http://127.0.0.1:${currentPort}/video/sse?token=${clientToken || 'YOUR_TOKEN'}`, 'ep-mode-video')}
                          className="px-2 py-0.5 rounded bg-white/10 hover:bg-white/20 text-slate-200 text-[10px] transition-colors cursor-pointer"
                        >
                          {copiedId === 'ep-mode-video' ? 'Copied!' : 'Copy URL'}
                        </button>
                      </div>
                      <div className="flex items-center justify-between text-[10px] text-slate-400 font-sans">
                        <span><strong className="text-slate-200 font-normal">Video Generation</strong> <span className="font-mono text-slate-300 text-[9.5px]">(custom-video-model, Veo 3.1)</span></span>
                        <span className="text-[9px] font-mono text-purple-400 bg-purple-500/10 px-1.5 py-0.2 rounded border border-purple-500/20">Local Disk MP4</span>
                      </div>
                    </div>

                    {/* Audio & Music Generation */}
                    <div className="p-2.5 rounded-xl bg-black/40 border border-white/5 space-y-1.5">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Volume2 className="w-3.5 h-3.5 text-emerald-400" />
                          <span className="text-emerald-300 font-bold">GET /audio/sse</span>
                        </div>
                        <button
                          onClick={() => copyToClipboard(`http://127.0.0.1:${currentPort}/audio/sse?token=${clientToken || 'YOUR_TOKEN'}`, 'ep-mode-audio')}
                          className="px-2 py-0.5 rounded bg-white/10 hover:bg-white/20 text-slate-200 text-[10px] transition-colors cursor-pointer"
                        >
                          {copiedId === 'ep-mode-audio' ? 'Copied!' : 'Copy URL'}
                        </button>
                      </div>
                      <div className="flex items-center justify-between text-[10px] text-slate-400 font-sans">
                        <span><strong className="text-slate-200 font-normal">Audio & Music Generation</strong> <span className="font-mono text-slate-300 text-[9.5px]">(lyria-3-pro)</span></span>
                        <span className="text-[9px] font-mono text-emerald-400 bg-emerald-500/10 px-1.5 py-0.2 rounded border border-emerald-500/20">Local Disk MP3</span>
                      </div>
                    </div>

                    {/* Coding Mode */}
                    <div className="p-2.5 rounded-xl bg-black/40 border border-white/5 space-y-1.5">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Code2 className="w-3.5 h-3.5 text-cyan-400" />
                          <span className="text-cyan-300 font-bold">GET /coding/sse</span>
                        </div>
                        <button
                          onClick={() => copyToClipboard(`http://127.0.0.1:${currentPort}/coding/sse?token=${clientToken || 'YOUR_TOKEN'}`, 'ep-mode-coding')}
                          className="px-2 py-0.5 rounded bg-white/10 hover:bg-white/20 text-slate-200 text-[10px] transition-colors cursor-pointer"
                        >
                          {copiedId === 'ep-mode-coding' ? 'Copied!' : 'Copy URL'}
                        </button>
                      </div>
                      <div className="flex items-center justify-between text-[10px] text-slate-400 font-sans">
                        <span><strong className="text-slate-200 font-normal">Coding Mode</strong> <span className="font-mono text-slate-300 text-[9.5px]">(kimi-k2-7-code, Claude Sonnet)</span></span>
                        <span className="text-[9px] font-mono text-cyan-400 bg-cyan-500/10 px-1.5 py-0.2 rounded border border-cyan-500/20">Code / Diffs</span>
                      </div>
                    </div>

                    {/* Writing & Prose Mode */}
                    <div className="p-2.5 rounded-xl bg-black/40 border border-white/5 space-y-1.5">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <PenTool className="w-3.5 h-3.5 text-amber-400" />
                          <span className="text-amber-300 font-bold">GET /writing/sse</span>
                        </div>
                        <button
                          onClick={() => copyToClipboard(`http://127.0.0.1:${currentPort}/writing/sse?token=${clientToken || 'YOUR_TOKEN'}`, 'ep-mode-writing')}
                          className="px-2 py-0.5 rounded bg-white/10 hover:bg-white/20 text-slate-200 text-[10px] transition-colors cursor-pointer"
                        >
                          {copiedId === 'ep-mode-writing' ? 'Copied!' : 'Copy URL'}
                        </button>
                      </div>
                      <div className="flex items-center justify-between text-[10px] text-slate-400 font-sans">
                        <span><strong className="text-slate-200 font-normal">Writing & Prose Mode</strong></span>
                        <span className="text-[9px] font-mono text-amber-400 bg-amber-500/10 px-1.5 py-0.2 rounded border border-amber-500/20">Prose / Markdown</span>
                      </div>
                    </div>
                  </div>

                  {/* MCP Settings Client Configuration Box */}
                  <div className="space-y-1.5 pt-1">
                    <div className="flex items-center justify-between text-[10px] text-slate-300 font-mono">
                      <span>MCP Client Configuration Example (e.g. Storyboard App / IDE):</span>
                      <button
                        onClick={() =>
                          copyToClipboard(
                            `{\n  "mcpServers": {\n    "transgentic-image": {\n      "command": "npx",\n      "args": ["-y", "mcp-remote", "http://127.0.0.1:${currentPort}/image/sse?token=${clientToken || 'YOUR_TOKEN'}"]\n    }\n  }\n}`,
                            'dedicated-mode-config'
                          )
                        }
                        className="px-2 py-0.5 rounded bg-white/10 hover:bg-white/20 text-slate-200 text-[10px] transition-colors cursor-pointer"
                      >
                        {copiedId === 'dedicated-mode-config' ? 'Copied!' : 'Copy JSON'}
                      </button>
                    </div>

                    <div className="bg-black/60 border border-white/10 rounded-xl p-2.5 font-mono text-[9px] text-cyan-300 overflow-x-auto">
                      <pre>{`{\n  "mcpServers": {\n    "transgentic-image": {\n      "command": "npx",\n      "args": ["-y", "mcp-remote", "http://127.0.0.1:${currentPort}/image/sse?token=${clientToken || 'YOUR_TOKEN'}"]\n    }\n  }\n}`}</pre>
                    </div>
                  </div>

                  {/* README Reference Note */}
                  <div className="bg-white/[0.02] border border-white/5 rounded-xl p-2.5 flex items-center justify-between text-[10px] text-slate-400 font-sans">
                    <div className="flex items-center gap-2">
                      <BookOpen className="w-3.5 h-3.5 text-purple-400 shrink-0" />
                      <span>
                        Custom application integration code examples (TypeScript and Python multi-turn thread clients) have been moved to <strong className="text-slate-200 font-mono">README.md</strong>.
                      </span>
                    </div>
                  </div>
                </div>

                {/* 6. Custom Webview Recipe Declarative Schema */}
                <div className="space-y-3 pt-1 border-t border-white/5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-200 uppercase font-mono flex items-center gap-1.5">
                      <FileCode className="w-3.5 h-3.5 text-teal-400" />
                      <span>6. Custom Webview Recipe Specification</span>
                    </span>
                    <span className="text-[9px] font-mono text-teal-400 bg-teal-500/10 px-2 py-0.5 rounded border border-teal-500/20">
                      Declarative JSON Engine
                    </span>
                  </div>

                  <p className="text-[10px] text-slate-400 leading-relaxed font-sans">
                    Transgentic allows you to connect any web AI portal as a full MCP provider using declarative JSON recipes. Recipes define interactive selectors, session cookies, and response extraction rules without writing code:
                  </p>

                  <div className="space-y-2 text-[11px]">
                    <div className="p-2.5 rounded-xl bg-black/40 border border-white/5 space-y-2">
                      <div className="flex items-center justify-between text-[10px] text-slate-300 font-mono">
                        <span className="text-teal-300 font-bold">Standard Recipe JSON Template:</span>
                        <button
                          onClick={() =>
                            copyToClipboard(
                              `{\n  "id": "custom_ai",\n  "title": "My Custom AI",\n  "version": "1.0.0",\n  "domainMatch": "chat.example.com",\n  "url": "https://chat.example.com/",\n  "newChatUrl": "https://chat.example.com/new",\n  "authStrategy": "cookie_sync",\n  "selectors": {\n    "inputPrompt": "#prompt-textarea, textarea, div[contenteditable='true']",\n    "submitButton": "button[data-testid='send-button'], button[type='submit'], form button",\n    "stopButton": "button[data-testid='stop-button'], button[aria-label*='Stop' i]"\n  },\n  "response": {\n    "container": "[data-role='assistant'], [data-message-author-role='assistant'], .response-turn",\n    "textSelector": ".markdown, .prose, [data-testid='message-text']",\n    "modes": {\n      "text": { "enabled": true, "mediaKind": "text" },\n      "image": { "enabled": true, "contentSelector": "img.generated-image", "mediaKind": "image" }\n    }\n  },\n  "models": [\n    { "id": "default", "displayName": "Default Model", "modes": ["general", "coding", "image"] }\n  ]\n}`,
                              'recipe-schema-snippet'
                            )
                          }
                          className="px-2 py-0.5 rounded bg-white/10 hover:bg-white/20 text-slate-200 text-[10px] transition-colors cursor-pointer"
                        >
                          {copiedId === 'recipe-schema-snippet' ? 'Copied!' : 'Copy Recipe JSON'}
                        </button>
                      </div>

                      <div className="bg-black/60 border border-white/10 rounded-xl p-2.5 font-mono text-[9px] text-teal-300 overflow-x-auto max-h-48">
                        <pre>{`{\n  "id": "custom_ai",\n  "title": "My Custom AI",\n  "version": "1.0.0",\n  "domainMatch": "chat.example.com",\n  "url": "https://chat.example.com/",\n  "newChatUrl": "https://chat.example.com/new",\n  "authStrategy": "cookie_sync",\n  "selectors": {\n    "inputPrompt": "#prompt-textarea, textarea, div[contenteditable='true']",\n    "submitButton": "button[data-testid='send-button'], button[type='submit'], form button",\n    "stopButton": "button[data-testid='stop-button'], button[aria-label*='Stop' i]"\n  },\n  "response": {\n    "container": "[data-role='assistant'], [data-message-author-role='assistant'], .response-turn",\n    "textSelector": ".markdown, .prose, [data-testid='message-text']",\n    "modes": {\n      "text": { "enabled": true, "mediaKind": "text" },\n      "image": { "enabled": true, "contentSelector": "img.generated-image", "mediaKind": "image" }\n    }\n  },\n  "models": [\n    { "id": "default", "displayName": "Default Model", "modes": ["general", "coding", "image"] }\n  ]\n}`}</pre>
                      </div>

                      <div className="space-y-1 text-[9.5px] text-slate-300 font-sans">
                        <div className="font-bold text-slate-200 font-mono text-[10px]">How to Add & Synchronize:</div>
                        <div>1. Go to <strong className="text-white">Settings → Providers → Manage Providers → Webview</strong> and click <strong className="text-teal-300">+ Add Webview Provider</strong>.</div>
                        <div>2. Paste or upload your JSON recipe. Transgentic stores it locally in <code className="text-cyan-300 font-mono">~/Documents/Transgentic/Recipes/Custom/</code>.</div>
                        <div>3. Open Google Chrome, navigate to the provider domain, and click <strong className="text-white">Sync Active Session</strong> in the Transgentic Sync extension.</div>
                        <div>4. Transgentic automatically creates dedicated MCP endpoints (<code className="text-cyan-300 font-mono">/custom_ai/sse</code>) and integrates the provider into the Task Routing Matrix!</div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 2. MODELS & PROVIDERS REGISTRY TAB */}
      {activeTab === 'models' && (
        <div className="space-y-4">
          {/* Provider family and selected provider */}
          {(() => {
            const allServices = servicesManifest?.services || {};
            const webviewProviders: ProviderId[] = Array.from(new Set([
              'chatgpt', 'claude', 'gemini', 'grok',
              ...Object.values(allServices).filter(s => !s.hidden && (s.providerType === 'webview' || s.id.startsWith('webview_') || s.id.startsWith('custom_'))).map(s => s.id),
            ]));
            const apiProviders = Object.values(allServices).filter(s => !s.hidden && (s.providerType === 'api' || s.id.startsWith('api_'))).map(s => s.id as ProviderId);
            const categoryProviders: Record<ProviderCategory, ProviderId[]> = { webview: webviewProviders, api: apiProviders, cli: [...CLI_IDS] };
            const activeTabsProviders = categoryProviders[providerCategory];
            const switchCategory = (category: ProviderCategory) => {
              soundFx.playClick();
              setShowExperimentalPage(false);
              setProviderCategory(category);
              if (category !== 'cli') setMoreProvidersTab(category);
              const remembered = selectedProviders[category];
              const next = categoryProviders[category].includes(remembered) ? remembered : categoryProviders[category][0] || '';
              setSelectedProvider(next);
              setSelectedProviders(previous => ({ ...previous, [category]: next }));
            };

            const renderProviderTab = (pid: ProviderId) => {
              const isDevDisabled = servicesManifest?.services?.[pid]?.enabled === false;
              const isExp = servicesManifest?.services?.[pid]?.experimental === true;
              const isCliProvider = providerCategory === 'cli';
              return (
                <button
                  key={pid}
                  onClick={() => {
                    soundFx.playClick();
                    setShowExperimentalPage(false);
                    setSelectedProvider(pid);
                    setSelectedProviders(previous => ({ ...previous, [providerCategory]: pid }));
                  }}
                  className={`relative flex min-w-0 items-center justify-center gap-1.5 overflow-hidden rounded-lg px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wider transition-all cursor-pointer select-none ${!showExperimentalPage && selectedProvider === pid
                      ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-[0_0_12px_rgba(6,182,212,0.25)]'
                      : isDevDisabled
                        ? 'text-rose-400/70 hover:text-rose-300 border border-transparent'
                        : 'text-slate-400 hover:text-slate-200 border border-transparent'
                    }`}
                >
                  {providerCategory === 'webview' && getProviderIcon(pid)}
                  <span className={`${isCliProvider ? 'w-full text-center' : 'min-w-0'} truncate`} title={getProviderLabel(pid)}>{getProviderLabel(pid)}</span>
                  {isDevDisabled && (
                    <span className={`${isCliProvider ? 'pointer-events-none absolute right-0.5 top-0.5 px-1 py-0.5 text-[6.5px] leading-none' : 'px-1 py-0.2 text-[7.5px]'} rounded border border-rose-500/20 bg-rose-500/10 font-mono text-rose-400`}>
                      OFF
                    </span>
                  )}
                </button>
              );
            };

            return <div className="space-y-2.5">
              <div className="flex items-center gap-2">
                <div className="grid min-w-0 flex-1 grid-cols-3 gap-1 rounded-xl border border-white/[0.06] bg-black/40 p-1">
                  {(['webview', 'api', 'cli'] as ProviderCategory[]).map(category => <button key={category} onClick={() => switchCategory(category)} className={`flex items-center justify-center gap-1.5 rounded-lg border px-2 py-2 text-[10px] font-semibold uppercase tracking-wider transition-all ${providerCategory === category ? 'border-cyan-500/40 bg-cyan-500/15 text-cyan-200 shadow-[0_0_14px_rgba(6,182,212,0.14)]' : 'border-transparent text-slate-500 hover:bg-white/5 hover:text-slate-300'}`}>{category === 'webview' ? <Globe className="h-3.5 w-3.5" /> : category === 'api' ? <Braces className="h-3.5 w-3.5" /> : <Terminal className="h-3.5 w-3.5" />}{category}</button>)}
                </div>
                <button disabled={providerCategory === 'cli'} title={providerCategory === 'cli' ? 'CLI providers are built in' : `Manage ${providerCategory} providers`} onClick={() => { soundFx.playClick(); setMoreProvidersTab(providerCategory as 'api' | 'webview'); setShowExperimentalPage(true); }} className={`flex shrink-0 items-center gap-1.5 rounded-lg border px-3 py-2 text-[10px] font-semibold transition-all ${showExperimentalPage ? 'border-teal-500/45 bg-teal-500/15 text-teal-200 shadow-[0_0_14px_rgba(20,184,166,0.14)]' : 'border-white/10 bg-white/[0.035] text-slate-400 hover:border-teal-500/30 hover:text-teal-200'} disabled:cursor-not-allowed disabled:opacity-35`}><Wrench className="h-3.5 w-3.5" />Manage</button>
              </div>
              {activeTabsProviders.length ? <div className="grid grid-cols-4 gap-1 rounded-xl border border-white/[0.05] bg-black/30 p-1">{activeTabsProviders.map(renderProviderTab)}</div> : <div className="rounded-xl border border-dashed border-white/10 bg-black/20 px-4 py-5 text-center text-[10.5px] text-slate-500">No API providers configured. Use Manage to add one.</div>}
            </div>;
          })()}

          {/* VIEW A: MORE PROVIDERS PAGE */}
          <div key={`${providerCategory}-${showExperimentalPage ? 'manage' : 'details'}`} className="provider-panel-enter">
          {showExperimentalPage ? (
            <div className="tactile-core-card p-4 rounded-2xl space-y-4 animate-in fade-in zoom-in-95 duration-200">
              {/* Header */}
              <div className="flex items-center justify-between pb-3 border-b border-white/10">
                <div className="flex items-center gap-2.5">
                  <button
                    onClick={() => {
                      soundFx.playClick();
                      setShowExperimentalPage(false);
                    }}
                    className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-slate-400 hover:text-slate-200 transition-colors cursor-pointer"
                    title="Back to Providers"
                  >
                    <ArrowLeft className="w-4 h-4" />
                  </button>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-xs font-bold text-slate-100 uppercase tracking-wide">
                        Manage Providers
                      </h3>
                    </div>
                    <p className="text-[10.5px] text-slate-400 mt-0.5">
                      {providerCategory === 'api' ? 'Add, edit, or remove OpenAI-compatible API services.' : 'Add and maintain Custom Recipe webview services.'}
                    </p>
                  </div>
                </div>

                <span className={`rounded-lg border px-2.5 py-1 text-[9px] font-mono uppercase tracking-wider ${providerCategory === 'api' ? 'border-cyan-500/25 bg-cyan-500/10 text-cyan-300' : 'border-teal-500/25 bg-teal-500/10 text-teal-300'}`}>{providerCategory}</span>
              </div>

              {/* TAB 1: API PROVIDERS */}
              {moreProvidersTab === 'api' && (
                <div className="space-y-4">
                  {/* Top Bar */}
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="text-xs font-semibold text-slate-200">
                        Custom API Providers ({(Object.values(servicesManifest?.services || {}).filter((s) => s.providerType === 'api' || s.id.startsWith('api_'))).length})
                      </h4>
                      <p className="text-[10.5px] text-slate-400">
                        Integrate external OpenAI-compatible endpoints with Transgentic tools & routing.
                      </p>
                    </div>
                    {!showApiForm && (
                      <button
                        type="button"
                        onClick={() => {
                          soundFx.playClick();
                          setEditingApiId(null);
                          setApiFormName('');
                          setApiFormBaseUrl('');
                          setApiFormApiKey('');
                          setApiFormModel('');
                          setApiFormError(null);
                          setShowApiForm(true);
                        }}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300 border border-cyan-500/40 text-xs font-semibold transition-all cursor-pointer"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Add API Provider</span>
                      </button>
                    )}
                  </div>

                  {/* Add / Edit Form Card */}
                  {showApiForm && (
                    <form onSubmit={handleSaveApiProvider} className="p-4 rounded-xl bg-black/40 border border-cyan-500/30 space-y-3.5 animate-in fade-in duration-150">
                      <div className="flex items-center justify-between pb-2 border-b border-white/5">
                        <span className="text-xs font-bold text-cyan-300 uppercase tracking-wide">
                          {editingApiId ? 'Edit API Provider' : 'Add API Provider'}
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            soundFx.playClick();
                            setShowApiForm(false);
                            setEditingApiId(null);
                          }}
                          className="p-1 rounded text-slate-400 hover:text-slate-200 cursor-pointer"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>

                      {apiFormError && (
                        <div className="p-2.5 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-300 text-[11px] flex items-center gap-2">
                          <AlertCircle className="w-4 h-4 shrink-0" />
                          <span>{apiFormError}</span>
                        </div>
                      )}

                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <label className="text-[10px] font-mono uppercase text-slate-400">Provider Name *</label>
                          <input
                            type="text"
                            required
                            placeholder="e.g. DeepSeek, Groq Cloud, OpenRouter"
                            value={apiFormName}
                            onChange={(e) => setApiFormName(e.target.value)}
                            className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-slate-200 focus:border-cyan-500/50 focus:outline-none"
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[10px] font-mono uppercase text-slate-400">Default Model ID</label>
                          <input
                            type="text"
                            placeholder="e.g. deepseek-chat, llama-3.3-70b-versatile"
                            value={apiFormModel}
                            onChange={(e) => setApiFormModel(e.target.value)}
                            className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-slate-200 focus:border-cyan-500/50 focus:outline-none"
                          />
                        </div>
                      </div>

                      <div className="space-y-1">
                        <label className="text-[10px] font-mono uppercase text-slate-400">Base URL * (OpenAI compatible)</label>
                        <input
                          type="text"
                          required
                          placeholder="e.g. https://api.deepseek.com/v1"
                          value={apiFormBaseUrl}
                          onChange={(e) => setApiFormBaseUrl(e.target.value)}
                          className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-xs font-mono text-slate-200 focus:border-cyan-500/50 focus:outline-none"
                        />
                      </div>

                      <div className="space-y-1">
                        <label className="text-[10px] font-mono uppercase text-slate-400">API Key (Optional / Stored in Vault)</label>
                        <input
                          type="password"
                          placeholder="sk-..."
                          value={apiFormApiKey}
                          onChange={(e) => setApiFormApiKey(e.target.value)}
                          className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-xs font-mono text-slate-200 focus:border-cyan-500/50 focus:outline-none"
                        />
                      </div>

                      <div className="flex items-center justify-end gap-2 pt-2 border-t border-white/5">
                        <button
                          type="button"
                          onClick={() => {
                            soundFx.playClick();
                            setShowApiForm(false);
                            setEditingApiId(null);
                          }}
                          className="px-3 py-1.5 rounded-lg text-xs text-slate-400 hover:text-slate-200 hover:bg-white/5 transition-colors cursor-pointer"
                        >
                          Cancel
                        </button>
                        <button
                          type="submit"
                          disabled={isSubmittingApi}
                          className="px-3.5 py-1.5 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-black font-semibold text-xs transition-colors cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
                        >
                          {isSubmittingApi ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                          <span>{editingApiId ? 'Update Provider' : 'Save Provider'}</span>
                        </button>
                      </div>
                    </form>
                  )}

                  {/* List of Custom API Providers */}
                  {(() => {
                    const apiProviders = Object.values(servicesManifest?.services || {}).filter(
                      (s) => s.providerType === 'api' || s.id.startsWith('api_')
                    );

                    if (apiProviders.length === 0 && !showApiForm) {
                      return (
                        <div className="p-8 text-center rounded-xl bg-white/[0.02] border border-dashed border-white/10 space-y-2.5">
                          <Braces className="w-8 h-8 text-slate-500 mx-auto" />
                          <p className="text-xs font-semibold text-slate-300">No Custom API Providers</p>
                          <p className="text-[11px] text-slate-500 max-w-sm mx-auto">
                            Add any OpenAI-compatible API endpoint (DeepSeek, Groq, OpenRouter, vLLM, etc.) to use alongside native providers.
                          </p>
                          <button
                            type="button"
                            onClick={() => {
                              soundFx.playClick();
                              setShowApiForm(true);
                            }}
                            className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300 border border-cyan-500/40 text-xs font-semibold transition-all cursor-pointer"
                          >
                            <Plus className="w-3.5 h-3.5" />
                            <span>Add Your First API Provider</span>
                          </button>
                        </div>
                      );
                    }

                    return (
                      <div className="space-y-2.5">
                        {apiProviders.map((srv) => (
                          <div
                            key={srv.id}
                            className="p-3.5 rounded-xl bg-white/[0.02] border border-white/10 hover:border-white/20 transition-all flex items-center justify-between gap-3"
                          >
                            <div className="flex items-center gap-3 min-w-0">
                              <div className="p-2 rounded-lg bg-cyan-500/10 border border-cyan-500/30 text-cyan-400">
                                <Braces className="w-4 h-4" />
                              </div>
                              <div className="min-w-0">
                                <div className="flex items-center gap-2">
                                  <span className="text-xs font-bold text-slate-100 truncate">{srv.name}</span>
                                  <span className="text-[9px] font-mono text-cyan-300 bg-cyan-500/15 px-1.5 py-0.5 rounded border border-cyan-500/30">
                                    API
                                  </span>
                                  {srv.defaultModelId && (
                                    <span className="text-[9.5px] font-mono text-slate-400 bg-white/5 px-1.5 py-0.5 rounded border border-white/10">
                                      {srv.defaultModelId}
                                    </span>
                                  )}
                                </div>
                                <p className="text-[10px] font-mono text-slate-400 truncate mt-0.5">
                                  {srv.baseUrl}
                                </p>
                              </div>
                            </div>

                            <div className="flex items-center gap-2 shrink-0">
                              <button
                                type="button"
                                onClick={() => {
                                  soundFx.playClick();
                                  setEditingApiId(srv.id);
                                  setApiFormName(srv.name);
                                  setApiFormBaseUrl(srv.baseUrl || '');
                                  setApiFormApiKey(srv.apiKey || '');
                                  setApiFormModel(srv.defaultModelId || '');
                                  setApiFormError(null);
                                  setShowApiForm(true);
                                }}
                                className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-slate-300 hover:text-cyan-300 transition-colors cursor-pointer"
                                title="Edit Provider"
                              >
                                <Pencil className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => handlePromptDeleteProvider(srv.id, srv.name, false)}
                                className="p-1.5 rounded-lg bg-white/5 hover:bg-rose-500/20 text-slate-400 hover:text-rose-400 transition-colors cursor-pointer"
                                title="Delete Provider"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    );
                  })()}
                </div>
              )}

              {/* TAB 2: WEBVIEW PROVIDERS */}
              {moreProvidersTab === 'webview' && (
                <div className="space-y-4">
                  {(() => {
                    const webviewProviders = Object.values(servicesManifest?.services || {}).filter(
                      (s) => s.providerType === 'webview' || s.id.startsWith('webview_') || (s.experimental && s.id !== 'localllm')
                    );

                    return (
                      <>
                        {/* Top Bar */}
                        <div className="flex items-center justify-between">
                          <div>
                            <h4 className="text-xs font-semibold text-slate-200">
                              Custom Webview Providers ({webviewProviders.length})
                            </h4>
                            <p className="text-[10.5px] text-slate-400">
                              Connect Custom Recipe webview providers. Install recipe first, then sync session via Chrome extension.
                            </p>
                          </div>
                          {!showWebviewForm && (
                            <button
                              type="button"
                              onClick={() => {
                                soundFx.playClick();
                                setWebviewFormRecipeJson('');
                                setWebviewFormError(null);
                                setWebviewFormSuccess(null);
                                setShowWebviewForm(true);
                              }}
                              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-teal-500/20 hover:bg-teal-500/30 text-teal-300 border border-teal-500/40 text-xs font-semibold transition-all cursor-pointer shadow-sm"
                            >
                              <Plus className="w-3.5 h-3.5" />
                              <span>Add Webview Provider</span>
                            </button>
                          )}
                        </div>

                        {/* Add Recipe Form Card */}
                        {showWebviewForm && (
                          <div className="p-4 rounded-xl bg-black/40 border border-teal-500/40 space-y-3.5 animate-in fade-in duration-150 shadow-[0_0_20px_rgba(20,184,166,0.1)]">
                            <div className="flex items-center justify-between pb-2 border-b border-white/5">
                              <div className="flex items-center gap-2">
                                <Globe className="w-4 h-4 text-teal-400" />
                                <span className="text-xs font-bold text-teal-300 uppercase tracking-wide">
                                  Add Webview Provider (Recipe)
                                </span>
                              </div>
                              <button
                                type="button"
                                onClick={() => {
                                  soundFx.playClick();
                                  setShowWebviewForm(false);
                                  setWebviewFormRecipeJson('');
                                  setWebviewFormError(null);
                                  setWebviewFormSuccess(null);
                                }}
                                className="p-1 rounded text-slate-400 hover:text-slate-200 cursor-pointer"
                              >
                                <X className="w-4 h-4" />
                              </button>
                            </div>

                            {/* Informational Callout explaining the workflow */}
                            <div className="p-3 rounded-lg bg-teal-500/10 border border-teal-500/20 text-teal-200 text-[11px] leading-relaxed flex items-start gap-2.5">
                              <Info className="w-4 h-4 text-teal-400 shrink-0 mt-0.5" />
                              <div>
                                <strong className="font-semibold text-teal-300 block mb-0.5">
                                  Standalone Recipe Registration:
                                </strong>
                                <span>
                                  Installing a recipe here registers the provider into Transgentic. Authenticated sessions must be synchronized via the <strong>Transgentic Sync</strong> Chrome extension. Once installed, navigating to the provider's domain in Chrome will display as <strong>Recipe Active</strong> (Direct Sync) instead of requiring a new recipe.
                                </span>
                              </div>
                            </div>

                            {/* File Upload & Load Template Actions */}
                            <div className="flex items-center justify-between gap-3">
                              <label className="relative inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-teal-500/15 hover:bg-teal-500/25 text-teal-300 border border-teal-500/30 text-xs font-semibold cursor-pointer transition-colors">
                                <input
                                  type="file"
                                  accept=".json"
                                  onChange={handleWebviewFileUpload}
                                  className="absolute inset-0 opacity-0 cursor-pointer w-full"
                                />
                                <FolderOpen className="w-3.5 h-3.5" />
                                <span>Choose .json Recipe File</span>
                              </label>

                              <button
                                type="button"
                                onClick={handleLoadRecipeTemplate}
                                className="px-2.5 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white border border-white/10 text-xs transition-colors cursor-pointer flex items-center gap-1.5"
                              >
                                <FileCode className="w-3.5 h-3.5 text-slate-400" />
                                <span>Load Template</span>
                              </button>
                            </div>

                            {/* Recipe JSON Textarea */}
                            <div className="space-y-1">
                              <div className="flex items-center justify-between">
                                <label className="text-[10px] font-mono uppercase text-slate-400">
                                  Custom Recipe JSON *
                                </label>
                                <span className="text-[10px] text-slate-500 font-mono">
                                  Paste schema or preconfig JSON
                                </span>
                              </div>
                              <textarea
                                rows={7}
                                value={webviewFormRecipeJson}
                                onChange={(e) => {
                                  setWebviewFormRecipeJson(e.target.value);
                                  validateWebviewRecipeInput(e.target.value);
                                }}
                                placeholder="Paste Custom Recipe JSON here..."
                                className="w-full bg-black/60 border border-white/10 rounded-lg p-2.5 text-xs font-mono text-cyan-200 focus:border-teal-500/60 focus:outline-none leading-relaxed resize-y"
                              />
                            </div>

                            {/* Validation & Status feedback */}
                            {webviewFormError && (
                              <div className="p-2.5 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-300 text-[11px] flex items-center gap-2">
                                <AlertCircle className="w-4 h-4 shrink-0" />
                                <span>{webviewFormError}</span>
                              </div>
                            )}

                            {webviewFormSuccess && (
                              <div className="p-2.5 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-[11px] flex items-center gap-2">
                                <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
                                <span>{webviewFormSuccess}</span>
                              </div>
                            )}

                            {/* Form Actions Footer */}
                            <div className="flex items-center justify-end gap-2 pt-2 border-t border-white/5">
                              <button
                                type="button"
                                onClick={() => {
                                  soundFx.playClick();
                                  setShowWebviewForm(false);
                                  setWebviewFormRecipeJson('');
                                  setWebviewFormError(null);
                                  setWebviewFormSuccess(null);
                                }}
                                className="px-3 py-1.5 rounded-lg text-xs text-slate-400 hover:text-slate-200 hover:bg-white/5 transition-colors cursor-pointer"
                              >
                                Cancel
                              </button>
                              <button
                                type="button"
                                onClick={handleSaveWebviewRecipe}
                                disabled={isSubmittingWebview || !webviewFormRecipeJson.trim()}
                                className="px-3.5 py-1.5 rounded-lg bg-teal-500 hover:bg-teal-400 text-black font-semibold text-xs transition-colors cursor-pointer flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed"
                              >
                                {isSubmittingWebview ? (
                                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                                ) : (
                                  <Check className="w-3.5 h-3.5" />
                                )}
                                <span>Save & Install Recipe</span>
                              </button>
                            </div>
                          </div>
                        )}

                        {/* List or Empty State */}
                        {webviewProviders.length === 0 && !showWebviewForm ? (
                          <div className="p-8 text-center rounded-xl bg-white/[0.02] border border-dashed border-white/10 space-y-3">
                            <Globe className="w-8 h-8 text-slate-500 mx-auto" />
                            <div>
                              <p className="text-xs font-semibold text-slate-300">No Webview Providers Connected</p>
                              <p className="text-[11px] text-slate-400 max-w-md mx-auto mt-1 leading-relaxed">
                                Custom Recipe webview providers allow integrating any web AI service using custom selectors. Add a recipe here first or use the Transgentic Sync extension.
                              </p>
                            </div>
                            <button
                              type="button"
                              onClick={() => {
                                soundFx.playClick();
                                setShowWebviewForm(true);
                              }}
                              className="mt-2 inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-teal-500/20 hover:bg-teal-500/30 text-teal-300 border border-teal-500/40 text-xs font-semibold transition-all cursor-pointer"
                            >
                              <Plus className="w-3.5 h-3.5" />
                              <span>Add Webview Provider</span>
                            </button>
                            <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-200/90 text-[11px] max-w-md mx-auto text-left leading-relaxed flex items-start gap-2">
                              <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                              <span>
                                Using custom webview recipes is entirely at the user's own discretion and responsibility. Transgentic acts strictly as an independent client-side bridge on an as-is basis without warranties.
                              </span>
                            </div>
                          </div>
                        ) : (
                          <div className="space-y-3.5">
                            {webviewProviders.map((srv) => {
                              const isEditing = editingWebviewId === srv.id;
                              const theme = getProviderTheme(srv.id, srv as any);
                              const Icon = theme.icon;
                              const isAuth = Boolean(providers[srv.id]?.isAuthenticated);

                              return (
                                <div
                                  key={srv.id}
                                  className="p-4 rounded-xl bg-teal-950/20 border border-teal-500/40 shadow-[0_0_20px_rgba(20,184,166,0.15)] space-y-3"
                                >
                                  <div className="flex items-center justify-between gap-3">
                                    <div className="flex items-center gap-3 min-w-0">
                                      <div className="p-2.5 rounded-xl bg-teal-500/10 border border-teal-500/30 text-teal-400">
                                        <Icon className="w-5 h-5" />
                                      </div>
                                      <div className="min-w-0">
                                        {isEditing ? (
                                          <div className="flex items-center gap-2">
                                            <input
                                              type="text"
                                              value={editingWebviewTitle}
                                              onChange={(e) => setEditingWebviewTitle(e.target.value)}
                                              className="bg-black/50 border border-teal-500/50 rounded px-2 py-0.5 text-xs text-white focus:outline-none"
                                              autoFocus
                                            />
                                            <button
                                              type="button"
                                              onClick={() => handleSaveWebviewTitle(srv.id)}
                                              className="px-2 py-0.5 rounded bg-teal-500 text-black text-[10px] font-bold cursor-pointer"
                                            >
                                              Save
                                            </button>
                                            <button
                                              type="button"
                                              onClick={() => setEditingWebviewId(null)}
                                              className="px-2 py-0.5 rounded bg-white/10 text-slate-300 text-[10px] cursor-pointer"
                                            >
                                              Cancel
                                            </button>
                                          </div>
                                        ) : (
                                          <div className="flex items-center gap-2 flex-wrap">
                                            <span className="text-sm font-bold text-slate-100">{srv.name}</span>
                                            <button
                                              type="button"
                                              onClick={() => {
                                                soundFx.playClick();
                                                setEditingWebviewId(srv.id);
                                                setEditingWebviewTitle(srv.name);
                                              }}
                                              className="p-1 rounded text-slate-400 hover:text-teal-300 transition-colors cursor-pointer"
                                              title="Edit Provider Title"
                                            >
                                              <Pencil className="w-3 h-3" />
                                            </button>
                                            <span className="text-[9px] font-mono text-slate-400 bg-white/5 px-2 py-0.5 rounded border border-white/10 truncate max-w-[200px]">
                                              {srv.id}
                                            </span>
                                            {isAuth ? (
                                              <span className="text-emerald-400 font-mono flex items-center gap-1 text-[9.5px] bg-emerald-500/10 border border-emerald-500/30 px-2 py-0.5 rounded-full">
                                                <CheckCircle2 className="w-3 h-3" /> Authenticated
                                              </span>
                                            ) : (
                                              <span className="text-amber-400 font-mono flex items-center gap-1 text-[9.5px] bg-amber-500/10 border border-amber-500/30 px-2 py-0.5 rounded-full" title="Sync auth cookies via Chrome extension">
                                                <AlertTriangle className="w-3 h-3" /> Requires Chrome Sync
                                              </span>
                                            )}
                                            {srv.url && (
                                              <a
                                                href={srv.url}
                                                target="_blank"
                                                rel="noreferrer"
                                                className="flex items-center gap-1 text-[10px] text-cyan-400 hover:text-cyan-300 font-mono underline underline-offset-2"
                                              >
                                                <span>{srv.url}</span>
                                                <ExternalLink className="w-2.5 h-2.5" />
                                              </a>
                                            )}
                                          </div>
                                        )}
                                        <p className="text-[10.5px] text-slate-400 mt-0.5">
                                          {isAuth
                                            ? 'Custom Recipe webview provider • Session synced.'
                                            : 'Recipe installed • Open site in Chrome and sync via Transgentic Sync extension to authenticate.'}
                                        </p>
                                      </div>
                                    </div>

                                    <div className="flex items-center gap-2 shrink-0">
                                      <button
                                        type="button"
                                        onClick={() => handlePromptDeleteProvider(srv.id, srv.name || srv.company, true)}
                                        className="p-2 rounded-lg bg-white/5 hover:bg-rose-500/20 text-slate-400 hover:text-rose-400 border border-white/10 transition-colors cursor-pointer"
                                        title="Remove Webview Provider"
                                      >
                                        <Trash2 className="w-3.5 h-3.5" />
                                      </button>
                                    </div>
                                  </div>

                                  {/* Disclaimer */}
                                  <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-200/90 text-[11px] leading-relaxed flex items-start gap-2.5">
                                    <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                                    <div>
                                      <strong className="text-amber-300 font-semibold block mb-0.5">
                                        User Responsibility Notice:
                                      </strong>
                                      <span>
                                        {srv.disclaimer || 'This recipe automates a third-party web interface. Transgentic is independent of the provider and grants no provider permission. Use only where authorized by the provider’s terms.'}
                                      </span>
                                    </div>
                                  </div>

                                  {/* Navigation button */}
                                  <div className="flex items-center justify-between pt-2 border-t border-white/5 text-[11px]">
                                    <span className="text-teal-400 font-mono flex items-center gap-1.5">
                                      <Check className="w-3.5 h-3.5 text-teal-400" />
                                      <span>Active in Hub, Routes, and Settings</span>
                                    </span>
                                    <button
                                      onClick={() => {
                                        soundFx.playClick();
                                        setShowExperimentalPage(false);
                                        setSelectedProvider(srv.id);
                                        setSelectedProviders(previous => ({ ...previous, webview: srv.id }));
                                      }}
                                      className="px-3 py-1 rounded-lg bg-teal-500/20 hover:bg-teal-500/30 text-teal-300 border border-teal-500/40 text-xs font-semibold transition-all cursor-pointer"
                                    >
                                      Configure Provider Settings →
                                    </button>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </>
                    );
                  })()}
                </div>
              )}
            </div>
          ) : providerCategory === 'cli' && isCliProvider(selectedProvider) ? (
            <CliServicesSettings manifest={servicesManifest} selectedProvider={selectedProvider as CliProviderId} onToggleService={onToggleService} />
          ) : providerCategory === 'api' ? (
            selectedProvider && servicesManifest?.services?.[selectedProvider] ? (() => {
              const service = servicesManifest.services[selectedProvider];
              return <div className="tactile-core-card overflow-hidden rounded-2xl border border-cyan-500/15 shadow-[0_0_24px_rgba(6,182,212,0.055)]">
                <div className="relative flex items-center justify-between gap-3 p-3.5 after:absolute after:bottom-0 after:left-3.5 after:right-3.5 after:h-px after:bg-white/5">
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="service-icon-box flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-cyan-300"><Braces className="h-4 w-4" /></div>
                    <div className="min-w-0">
                      <div className="flex min-w-0 items-center gap-2"><h3 className="truncate text-xs font-bold uppercase tracking-wide text-slate-100">{service.name}</h3><span className="rounded-md border border-cyan-500/25 bg-cyan-500/10 px-1.5 py-0.5 text-[8px] font-mono uppercase text-cyan-300">API</span></div>
                      <p className="mt-1 truncate font-mono text-[9.5px] text-slate-500">OpenAI-compatible provider</p>
                    </div>
                  </div>
                  <label className="relative inline-flex shrink-0 cursor-pointer items-center" title={`${currentProvConfig.serviceEnabled ? 'Disable' : 'Enable'} ${service.name}`}>
                    <input type="checkbox" className="peer sr-only" checked={currentProvConfig.serviceEnabled} onChange={event => { soundFx.playClick(); onToggleService(selectedProvider, event.target.checked); }} aria-label={`${currentProvConfig.serviceEnabled ? 'Disable' : 'Enable'} ${service.name}`} />
                    <span className="relative h-5 w-9 rounded-full border border-white/10 bg-slate-800 shadow-inner transition-colors peer-checked:border-cyan-400/40 peer-checked:bg-cyan-500/70 peer-focus-visible:ring-2 peer-focus-visible:ring-cyan-400/50 after:absolute after:left-[2px] after:top-[2px] after:h-3.5 after:w-3.5 after:rounded-full after:bg-slate-300 after:shadow after:transition-transform peer-checked:after:translate-x-4 peer-checked:after:bg-white" />
                  </label>
                </div>
                <div className="space-y-3 p-4">
                  <div className="grid gap-3 sm:grid-cols-2"><div className="rounded-xl border border-white/[0.07] bg-black/25 p-3"><div className="text-[9px] font-mono uppercase tracking-wider text-slate-500">Base URL</div><div className="mt-1 truncate font-mono text-[10.5px] text-cyan-200" title={service.baseUrl}>{service.baseUrl}</div></div><div className="rounded-xl border border-white/[0.07] bg-black/25 p-3"><div className="text-[9px] font-mono uppercase tracking-wider text-slate-500">Default model</div><div className="mt-1 truncate font-mono text-[10.5px] text-slate-200">{service.defaultModelId || 'default'}</div></div></div>
                  <div className="flex items-center justify-between rounded-xl border border-emerald-500/15 bg-emerald-500/[0.045] p-3"><div className="flex items-center gap-2 text-[10.5px] text-emerald-200"><CheckCircle2 className="h-4 w-4" />Available to routes and the completion gateway when enabled.</div><button onClick={() => { setEditingApiId(service.id); setApiFormName(service.name); setApiFormBaseUrl(service.baseUrl || ''); setApiFormApiKey(service.apiKey || ''); setApiFormModel(service.defaultModelId || ''); setApiFormError(null); setShowApiForm(true); setMoreProvidersTab('api'); setShowExperimentalPage(true); }} className="rounded-lg border border-cyan-500/25 bg-cyan-500/10 px-3 py-1.5 text-[10px] font-semibold text-cyan-200 hover:bg-cyan-500/20"><Pencil className="mr-1.5 inline h-3 w-3" />Edit in Manage</button></div>
                </div>
              </div>;
            })() : null
          ) : (
            /* VIEW B: STANDARD PROVIDER CONFIG CARD */
            <div className="tactile-core-card p-3.5 rounded-2xl space-y-4">
              {/* Service-Level Toggle & Re-sync */}
              <div className="flex items-center justify-between gap-3 border-b border-white/5 pb-3">
                <div className="flex min-w-0 items-center gap-3">
                  <div className="service-icon-box flex h-9 w-9 shrink-0 items-center justify-center rounded-xl">
                    {getProviderIcon(selectedProvider)}
                  </div>
                  <div className="min-w-0">
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="truncate text-xs font-bold uppercase tracking-wide text-slate-100">
                        {getProviderLabel(selectedProvider)}
                      </span>
                    </div>
                    <span className="text-[10px] text-slate-500 font-mono">
                      {providers[selectedProvider]?.isAuthenticated ? '● Authenticated' : '○ Not logged in'}
                    </span>
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="flex shrink-0 items-center gap-1.5">
                  <button
                    onClick={() => {
                      soundFx.playClick();
                      setShowAuthModalProvider(selectedProvider);
                    }}
                    className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-teal-500/15 hover:bg-teal-500/25 text-teal-300 border border-teal-500/30 text-[10px] font-mono font-semibold transition-all cursor-pointer shadow-[0_0_10px_rgba(20,184,166,0.15)]"
                    title="Sync authenticated session from System Google Chrome"
                  >
                    <Link className="w-3 h-3 text-teal-400" />
                    <span>Chrome Sync</span>
                  </button>

                  {/* Re-sync Button */}
                  <button
                    disabled={isResyncing}
                    onClick={handleResync}
                    className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 text-[10px] font-mono font-semibold transition-all cursor-pointer"
                    title="Scan live web session for available models"
                  >
                    <RefreshCw className={`w-3 h-3 ${isResyncing ? 'animate-spin text-cyan-400' : ''}`} />
                    <span>{isResyncing ? 'Scanning...' : 'Models Sync'}</span>
                  </button>
                  <label
                    className="relative inline-flex shrink-0 cursor-pointer items-center"
                    title={`${currentProvConfig.serviceEnabled ? 'Disable' : 'Enable'} ${getProviderLabel(selectedProvider)}`}
                  >
                    <input
                      type="checkbox"
                      checked={currentProvConfig.serviceEnabled}
                      onChange={(e) => {
                        soundFx.playClick();
                        onToggleService(selectedProvider, e.target.checked);
                      }}
                      className="peer sr-only"
                      aria-label={`${currentProvConfig.serviceEnabled ? 'Disable' : 'Enable'} ${getProviderLabel(selectedProvider)}`}
                    />
                    <span className="relative h-5 w-9 rounded-full border border-white/10 bg-slate-800 shadow-inner transition-colors peer-checked:border-cyan-400/40 peer-checked:bg-cyan-500/70 peer-focus-visible:ring-2 peer-focus-visible:ring-cyan-400/50 after:absolute after:left-[2px] after:top-[2px] after:h-3.5 after:w-3.5 after:rounded-full after:bg-slate-300 after:shadow after:transition-transform peer-checked:after:translate-x-4 peer-checked:after:bg-white" />
                  </label>
                </div>
              </div>

              {resyncSuccess && (
                <div className="text-[10px] font-mono text-emerald-400 bg-emerald-500/10 px-2 py-1 rounded-lg border border-emerald-500/20 flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Live models refreshed & synced non-destructively!</span>
                </div>
              )}

              {/* Provider Safe Hourly Quota & Subscription Limit Settings */}
              <div className="space-y-2 bg-black/40 p-3 rounded-xl border border-white/5">
                <div className="flex items-center justify-between">
                  <label className="text-[10px] font-mono uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
                    <Timer className="w-3.5 h-3.5 text-cyan-400" />
                    <span>Safe Hourly Quota Ceiling:</span>
                  </label>
                  <span className="text-xs font-mono font-bold text-cyan-300">
                    {currentProvConfig.hourlyLimit || 30} reqs / hr
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min="5"
                    max="200"
                    value={currentProvConfig.hourlyLimit || 30}
                    onChange={(e) => {
                      const val = parseInt(e.target.value, 10);
                      if (!isNaN(val) && val > 0) {
                        onUpdateProviderConfig(selectedProvider, { hourlyLimit: val });
                      }
                    }}
                    className="w-24 bg-black/50 border border-white/10 rounded-lg px-2 py-1 text-xs text-cyan-300 font-mono text-center"
                  />

                  {/* Subscription Tier Quick Preset Buttons */}
                  <div className="flex items-center gap-1 flex-1">
                    <button
                      onClick={() => {
                        soundFx.playClick();
                        onUpdateProviderConfig(selectedProvider, { hourlyLimit: 15 });
                      }}
                      className="px-2 py-1 rounded-lg bg-white/5 hover:bg-white/10 text-slate-300 text-[9.5px] font-mono border border-white/5 transition-colors cursor-pointer"
                    >
                      Free (15/hr)
                    </button>
                    <button
                      onClick={() => {
                        soundFx.playClick();
                        onUpdateProviderConfig(selectedProvider, { hourlyLimit: 30 });
                      }}
                      className="px-2 py-1 rounded-lg bg-cyan-500/15 hover:bg-cyan-500/25 text-cyan-300 text-[9.5px] font-mono border border-cyan-500/30 transition-colors cursor-pointer"
                    >
                      Plus/Pro (30/hr)
                    </button>
                    <button
                      onClick={() => {
                        soundFx.playClick();
                        onUpdateProviderConfig(selectedProvider, { hourlyLimit: 50 });
                      }}
                      className="px-2 py-1 rounded-lg bg-purple-500/15 hover:bg-purple-500/25 text-purple-300 text-[9.5px] font-mono border border-purple-500/30 transition-colors cursor-pointer"
                    >
                      Team/Ultra (50/hr)
                    </button>
                  </div>
                </div>
                <p className="text-[9px] text-slate-400 font-sans">
                  When requests reach this limit, Transgentic immediately switches to your next fallback provider in Routes, preserving your subscription quota.
                </p>
              </div>

              {/* Selection Strategy Hierarchy */}
              <div className="space-y-2.5">
                <label className="text-[10px] font-mono uppercase tracking-wider text-slate-400">
                  Model Selection Strategy:
                </label>

                <div className="grid grid-cols-2 gap-2">
                  {/* Hybrid Mode */}
                  <button
                    onClick={() => {
                      soundFx.playClick();
                      onUpdateProviderConfig(selectedProvider, { activeSelectionMode: 'hybrid' });
                    }}
                    className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer ${currentProvConfig.activeSelectionMode === 'hybrid'
                        ? 'bg-cyan-500/15 border-cyan-500/50 text-slate-100 shadow-[0_0_12px_rgba(6,182,212,0.15)]'
                        : 'bg-white/5 border-white/5 hover:border-white/15 text-slate-400'
                      }`}
                  >
                    <div className="flex items-center gap-1.5 text-xs font-bold text-cyan-300">
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>Smart Hybrid Selection</span>
                    </div>
                    <p className="text-[9px] text-slate-400 mt-1">
                      Automates model switching in Webview according to default preset and MCP tool requests.
                    </p>
                  </button>

                  {/* Lock Active Session */}
                  <button
                    onClick={() => {
                      soundFx.playClick();
                      onUpdateProviderConfig(selectedProvider, { activeSelectionMode: 'lock_active_session' });
                    }}
                    className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer ${currentProvConfig.activeSelectionMode === 'lock_active_session'
                        ? 'bg-purple-500/15 border-purple-500/50 text-slate-100 shadow-[0_0_12px_rgba(168,85,247,0.15)]'
                        : 'bg-white/5 border-white/5 hover:border-white/15 text-slate-400'
                      }`}
                  >
                    <div className="flex items-center gap-1.5 text-xs font-bold text-purple-300">
                      <Lock className="w-3.5 h-3.5" />
                      <span>Lock Active Session</span>
                    </div>
                    <p className="text-[9px] text-slate-400 mt-1">
                      Bypasses DOM switching completely. Prompts are dispatched to whatever model is open in Webview.
                    </p>
                  </button>
                </div>

                {/* Dynamic MCP Override Toggle */}
                <div className="flex items-center justify-between bg-black/40 p-2.5 rounded-xl border border-white/5">
                  <div>
                    <span className="text-[11px] font-semibold text-slate-200">
                      Allow MCP Tool Model Override
                    </span>
                    <p className="text-[9px] text-slate-500 font-mono">
                      Enables Codex/Antigravity to pass specific model argument (e.g. o1, opus, grok-3).
                    </p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={currentProvConfig.allowMcpOverride}
                      onChange={(e) => {
                        soundFx.playClick();
                        onUpdateProviderConfig(selectedProvider, { allowMcpOverride: e.target.checked });
                      }}
                      className="sr-only peer"
                    />
                    <div className="w-9 h-5 bg-white/10 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-cyan-500"></div>
                  </label>
                </div>

                {/* Default Model Selector */}
                <div className="space-y-1">
                  <label className="text-[10px] font-mono uppercase tracking-wider text-slate-400">
                    Default Fallback Model:
                  </label>
                  <select
                    value={currentProvConfig.defaultModelId}
                    onChange={(e) => {
                      soundFx.playClick();
                      onUpdateProviderConfig(selectedProvider, { defaultModelId: e.target.value });
                    }}
                    className="w-full bg-black/50 border border-white/10 rounded-xl px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-cyan-500/50 cursor-pointer"
                  >
                    {currentProvConfig.models.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.displayName} {m.requiresTier ? `(${m.requiresTier})` : ''}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Model-Level Availability Checkboxes */}
              <div className="space-y-2 pt-2 border-t border-white/5">
                <div className="flex items-center justify-between">
                  <label className="text-[10px] font-mono uppercase tracking-wider text-slate-400">
                    Discovered & Usable Models:
                  </label>
                  <span className="text-[9px] text-slate-500 font-mono">
                    IsUsable = ServiceEnabled ∧ UserEnabled ∧ Discovered
                  </span>
                </div>

                <div className="space-y-1.5">
                  {currentProvConfig.models.map((model) => {
                    const isModelDevDisabled =
                      servicesManifest?.services?.[selectedProvider]?.models?.find(
                        (m) => m.id === model.id
                      )?.enabled === false ||
                      servicesManifest?.services?.[selectedProvider]?.enabled === false;

                    const isUsable =
                      !isModelDevDisabled &&
                      currentProvConfig.serviceEnabled &&
                      model.userEnabled &&
                      model.discoveredAvailable;

                    return (
                      <div
                        key={model.id}
                        className={`flex items-center justify-between p-2 rounded-xl border transition-colors ${isModelDevDisabled
                            ? 'bg-rose-500/[0.03] border-rose-500/20 opacity-70'
                            : 'bg-white/5 border-white/5 hover:border-white/10'
                          }`}
                      >
                        <label className="flex items-center gap-2.5 cursor-pointer flex-1">
                          <input
                            type="checkbox"
                            disabled={isModelDevDisabled}
                            checked={model.userEnabled && !isModelDevDisabled}
                            onChange={(e) => {
                              soundFx.playClick();
                              onToggleModel(selectedProvider, model.id, e.target.checked);
                            }}
                            className="rounded border-white/20 bg-black/40 text-cyan-500 focus:ring-0 disabled:opacity-40"
                          />
                          <div>
                            <div className="flex items-center gap-1.5">
                              <span className="text-xs font-semibold text-slate-200">
                                {model.displayName}
                              </span>
                              {isModelDevDisabled && (
                                <span className="text-[8.5px] font-mono text-rose-400 bg-rose-500/10 px-1 py-0.2 rounded border border-rose-500/20">
                                  Manifest Disabled
                                </span>
                              )}
                              {model.requiresTier && (
                                <span className="text-[9px] font-mono text-purple-400 bg-purple-500/10 px-1.5 py-0.2 rounded border border-purple-500/20">
                                  {model.requiresTier}
                                </span>
                              )}
                            </div>
                            <span className="text-[9px] font-mono text-slate-500">
                              ID: {model.id} {model.discoveredAvailable ? '• Discovered Live' : '• Cached'}
                            </span>
                          </div>
                        </label>

                        <div>
                          {isModelDevDisabled ? (
                            <span className="text-[9px] font-mono text-rose-400 bg-rose-500/10 px-1.5 py-0.5 rounded border border-rose-500/20">
                              BYPASSED
                            </span>
                          ) : isUsable ? (
                            <span className="text-[9px] font-mono text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/20">
                              ACTIVE
                            </span>
                          ) : (
                            <span className="text-[9px] font-mono text-slate-500 bg-white/5 px-1.5 py-0.5 rounded">
                              OFF
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
          </div>
        </div>
      )}

      {/* Chrome Authentication & Session Sync Modal */}
      {showAuthModalProvider && (
        <AuthModal
          isOpen={Boolean(showAuthModalProvider)}
          onClose={() => setShowAuthModalProvider(null)}
          providerId={showAuthModalProvider}
          providerName={getProviderLabel(showAuthModalProvider)}
          providerUrl={providers[showAuthModalProvider]?.url || ''}
          onSynced={() => {
            handleResync();
          }}
        />
      )}

      {/* Remove Provider Confirmation Modal */}
      {providerToDelete && (
        <DeleteProviderModal
          providerId={providerToDelete.id}
          providerName={providerToDelete.name}
          isWebview={providerToDelete.isWebview}
          servicesManifest={servicesManifest}
          isDeleting={isDeletingProvider}
          onConfirm={handleConfirmDeleteProvider}
          onClose={() => setProviderToDelete(null)}
        />
      )}
    </div>
  );
};
