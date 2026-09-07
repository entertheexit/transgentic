import React from 'react';
import {
  Bot,
  Brain,
  Sparkles,
  Cpu,
  Zap,
  Flame,
  Globe,
  Code2,
  Terminal,
  Shield,
  MessageSquare,
  Key,
  Layers,
  Lock,
  Server,
  Activity,
  Compass,
  Eye,
  Orbit,
  Atom,
  Search,
  Wand2,
  Feather,
  PenTool,
  Image as ImageIcon,
  Video,
  Music,
  Radio,
  Sliders,
  HelpCircle,
  FlaskConical,
  Braces,
} from 'lucide-react';
import { ProviderId, ProviderStatus, ServiceManifestEntry, ServiceThemeConfig, ServicesManifest } from '../../shared/types.js';

export type SupportedIconComponent = React.ComponentType<{ className?: string }>;

export const ICON_REGISTRY: Record<string, SupportedIconComponent> = {
  bot: Bot,
  Bot: Bot,
  brain: Brain,
  Brain: Brain,
  sparkles: Sparkles,
  Sparkles: Sparkles,
  cpu: Cpu,
  Cpu: Cpu,
  zap: Zap,
  Zap: Zap,
  flame: Flame,
  Flame: Flame,
  globe: Globe,
  Globe: Globe,
  flask: FlaskConical,
  Flask: FlaskConical,
  flaskconical: FlaskConical,
  FlaskConical: FlaskConical,
  lab: FlaskConical,
  Lab: FlaskConical,
  beaker: FlaskConical,
  Beaker: FlaskConical,
  code: Code2,
  code2: Code2,
  Code2: Code2,
  terminal: Terminal,
  Terminal: Terminal,
  shield: Shield,
  Shield: Shield,
  message: MessageSquare,
  messagesquare: MessageSquare,
  MessageSquare: MessageSquare,
  key: Key,
  Key: Key,
  layers: Layers,
  Layers: Layers,
  lock: Lock,
  Lock: Lock,
  server: Server,
  Server: Server,
  activity: Activity,
  Activity: Activity,
  compass: Compass,
  Compass: Compass,
  eye: Eye,
  Eye: Eye,
  orbit: Orbit,
  Orbit: Orbit,
  atom: Atom,
  Atom: Atom,
  search: Search,
  Search: Search,
  wand: Wand2,
  wand2: Wand2,
  Wand2: Wand2,
  feather: Feather,
  Feather: Feather,
  pentool: PenTool,
  PenTool: PenTool,
  image: ImageIcon,
  ImageIcon: ImageIcon,
  video: Video,
  Video: Video,
  music: Music,
  Music: Music,
  radio: Radio,
  Radio: Radio,
  sliders: Sliders,
  Sliders: Sliders,
  braces: Braces,
  Braces: Braces,
};

export interface ResolvedProviderTheme {
  icon: SupportedIconComponent;
  iconName: string;
  accentColor: string;
  textClass: string;
  bgClass: string;
  borderClass: string;
  badgeClass: string;
  glowClass: string;
  hoverBorderClass: string;
}

const DEFAULT_THEMES: Record<ProviderId, ResolvedProviderTheme> = {
  chatgpt: {
    icon: Bot,
    iconName: 'Bot',
    accentColor: 'emerald',
    textClass: 'text-emerald-400',
    bgClass: 'bg-emerald-500/10',
    borderClass: 'border-emerald-500/30',
    badgeClass: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
    glowClass: 'shadow-[0_0_15px_rgba(16,185,129,0.15)]',
    hoverBorderClass: 'hover:border-emerald-500/40',
  },
  claude: {
    icon: Brain,
    iconName: 'Brain',
    accentColor: 'amber',
    textClass: 'text-amber-400',
    bgClass: 'bg-amber-500/10',
    borderClass: 'border-amber-500/30',
    badgeClass: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
    glowClass: 'shadow-[0_0_15px_rgba(245,158,11,0.15)]',
    hoverBorderClass: 'hover:border-amber-500/40',
  },
  gemini: {
    icon: Sparkles,
    iconName: 'Sparkles',
    accentColor: 'blue',
    textClass: 'text-blue-400',
    bgClass: 'bg-blue-500/10',
    borderClass: 'border-blue-500/30',
    badgeClass: 'bg-blue-500/15 text-blue-300 border-blue-500/30',
    glowClass: 'shadow-[0_0_15px_rgba(59,130,246,0.15)]',
    hoverBorderClass: 'hover:border-blue-500/40',
  },
  grok: {
    icon: Cpu,
    iconName: 'Cpu',
    accentColor: 'purple',
    textClass: 'text-purple-400',
    bgClass: 'bg-purple-500/10',
    borderClass: 'border-purple-500/30',
    badgeClass: 'bg-purple-500/15 text-purple-300 border-purple-500/30',
    glowClass: 'shadow-[0_0_15px_rgba(168,85,247,0.15)]',
    hoverBorderClass: 'hover:border-purple-500/40',
  },
  localllm: {
    icon: Cpu,
    iconName: 'Cpu',
    accentColor: 'cyan',
    textClass: 'text-cyan-400',
    bgClass: 'bg-cyan-500/10',
    borderClass: 'border-cyan-500/30',
    badgeClass: 'bg-cyan-500/15 text-cyan-300 border-cyan-500/30',
    glowClass: 'shadow-[0_0_15px_rgba(6,182,212,0.15)]',
    hoverBorderClass: 'hover:border-cyan-500/40',
  },
};

const COLOR_MAP: Record<string, { text: string; bg: string; border: string; badge: string; glow: string; hoverBorder: string }> = {
  emerald: {
    text: 'text-emerald-400',
    bg: 'bg-emerald-500/10',
    border: 'border-emerald-500/30',
    badge: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
    glow: 'shadow-[0_0_15px_rgba(16,185,129,0.15)]',
    hoverBorder: 'hover:border-emerald-500/40',
  },
  amber: {
    text: 'text-amber-400',
    bg: 'bg-amber-500/10',
    border: 'border-amber-500/30',
    badge: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
    glow: 'shadow-[0_0_15px_rgba(245,158,11,0.15)]',
    hoverBorder: 'hover:border-amber-500/40',
  },
  blue: {
    text: 'text-blue-400',
    bg: 'bg-blue-500/10',
    border: 'border-blue-500/30',
    badge: 'bg-blue-500/15 text-blue-300 border-blue-500/30',
    glow: 'shadow-[0_0_15px_rgba(59,130,246,0.15)]',
    hoverBorder: 'hover:border-blue-500/40',
  },
  purple: {
    text: 'text-purple-400',
    bg: 'bg-purple-500/10',
    border: 'border-purple-500/30',
    badge: 'bg-purple-500/15 text-purple-300 border-purple-500/30',
    glow: 'shadow-[0_0_15px_rgba(168,85,247,0.15)]',
    hoverBorder: 'hover:border-purple-500/40',
  },
  cyan: {
    text: 'text-cyan-400',
    bg: 'bg-cyan-500/10',
    border: 'border-cyan-500/30',
    badge: 'bg-cyan-500/15 text-cyan-300 border-cyan-500/30',
    glow: 'shadow-[0_0_15px_rgba(6,182,212,0.15)]',
    hoverBorder: 'hover:border-cyan-500/40',
  },
  rose: {
    text: 'text-rose-400',
    bg: 'bg-rose-500/10',
    border: 'border-rose-500/30',
    badge: 'bg-rose-500/15 text-rose-300 border-rose-500/30',
    glow: 'shadow-[0_0_15px_rgba(244,63,94,0.15)]',
    hoverBorder: 'hover:border-rose-500/40',
  },
  violet: {
    text: 'text-violet-400',
    bg: 'bg-violet-500/10',
    border: 'border-violet-500/30',
    badge: 'bg-violet-500/15 text-violet-300 border-violet-500/30',
    glow: 'shadow-[0_0_15px_rgba(139,92,246,0.15)]',
    hoverBorder: 'hover:border-violet-500/40',
  },
  teal: {
    text: 'text-teal-400',
    bg: 'bg-teal-500/10',
    border: 'border-teal-500/30',
    badge: 'bg-teal-500/15 text-teal-300 border-teal-500/30',
    glow: 'shadow-[0_0_15px_rgba(20,184,166,0.15)]',
    hoverBorder: 'hover:border-teal-500/40',
  },
  orange: {
    text: 'text-orange-400',
    bg: 'bg-orange-500/10',
    border: 'border-orange-500/30',
    badge: 'bg-orange-500/15 text-orange-300 border-orange-500/30',
    glow: 'shadow-[0_0_15px_rgba(249,115,22,0.15)]',
    hoverBorder: 'hover:border-orange-500/40',
  },
};

/**
 * Resolves a Lucide icon component by name string with fallback.
 */
export function getProviderIconComponent(iconName?: string, fallbackProvider?: ProviderId): SupportedIconComponent {
  if (iconName && ICON_REGISTRY[iconName]) {
    return ICON_REGISTRY[iconName];
  }
  if (fallbackProvider) {
    if (fallbackProvider.startsWith('api_')) {
      return Braces;
    }
    if (fallbackProvider.startsWith('webview_')) {
      return Globe;
    }
    if (DEFAULT_THEMES[fallbackProvider]) {
      return DEFAULT_THEMES[fallbackProvider].icon;
    }
  }
  return Bot;
}

/**
 * Resolves complete theme and Tailwind classes for a provider from ai_services.json manifest.
 */
export function getProviderTheme(
  providerId: ProviderId,
  manifestEntry?: ServiceManifestEntry | null
): ResolvedProviderTheme {
  const isApi = providerId.startsWith('api_') || manifestEntry?.providerType === 'api';
  let fallback = DEFAULT_THEMES[providerId];
  if (!fallback) {
    if (isApi) {
      fallback = {
        icon: Braces,
        iconName: 'Braces',
        accentColor: 'cyan',
        textClass: 'text-cyan-400',
        bgClass: 'bg-cyan-500/10',
        borderClass: 'border-cyan-500/30',
        badgeClass: 'bg-cyan-500/15 text-cyan-300 border-cyan-500/30',
        glowClass: 'shadow-[0_0_15px_rgba(6,182,212,0.15)]',
        hoverBorderClass: 'hover:border-cyan-500/40',
      };
    } else if (providerId.startsWith('webview_')) {
      fallback = {
        icon: Globe,
        iconName: 'Globe',
        accentColor: 'teal',
        textClass: 'text-teal-400',
        bgClass: 'bg-teal-500/10',
        borderClass: 'border-teal-500/30',
        badgeClass: 'bg-teal-500/15 text-teal-300 border-teal-500/30',
        glowClass: 'shadow-[0_0_15px_rgba(20,184,166,0.15)]',
        hoverBorderClass: 'hover:border-teal-500/40',
      };
    } else {
      fallback = DEFAULT_THEMES.chatgpt;
    }
  }

  if (!manifestEntry) {
    return fallback;
  }

  const customTheme = manifestEntry.theme;
  let iconName = manifestEntry.iconName || customTheme?.iconName;
  if (isApi && (!iconName || iconName === 'Key' || iconName === 'Server')) {
    iconName = 'Braces';
  } else if (!iconName) {
    iconName = fallback.iconName;
  }

  const icon = isApi && (!manifestEntry.iconName || manifestEntry.iconName === 'Key' || manifestEntry.iconName === 'Server')
    ? Braces
    : getProviderIconComponent(iconName, isApi ? ('api_' as any) : providerId);
  const accentColor = manifestEntry.accentColor || customTheme?.accentColor || fallback.accentColor;

  const colorPresets = COLOR_MAP[accentColor] || COLOR_MAP.emerald;

  return {
    icon,
    iconName,
    accentColor,
    textClass: customTheme?.textClass || colorPresets.text,
    bgClass: customTheme?.bgClass || colorPresets.bg,
    borderClass: customTheme?.borderClass || colorPresets.border,
    badgeClass: customTheme?.badgeClass || colorPresets.badge,
    glowClass: customTheme?.glowClass || colorPresets.glow,
    hoverBorderClass: colorPresets.hoverBorder,
  };
}

/**
 * Helper to retrieve theme for a provider directly from the full manifest store.
 */
export function getProviderThemeFromManifest(
  providerId: ProviderId,
  manifest?: ServicesManifest | null
): ResolvedProviderTheme {
  const entry = manifest?.services?.[providerId];
  return getProviderTheme(providerId, entry);
}

/**
 * Resolves a human-readable title / display name for a provider identifier.
 * - 'localllm' -> 'Local LLM'
 * - 'chatgpt' -> 'ChatGPT'
 * - 'claude' -> 'Claude'
 * - 'gemini' -> 'Gemini'
 * - 'grok' -> 'Grok'
 * - 'webview_<hash>' or raw hash -> matched title/domain from servicesManifest or providers
 * - Compound 'A + B' -> formatted individually and rejoined
 */
export function getProviderDisplayName(
  providerId?: string,
  servicesManifest?: ServicesManifest | null,
  providers?: Record<string, ProviderStatus> | null
): string {
  if (!providerId) return '';

  // 1. Handle compound/dual-dispatch providers, e.g. "localllm + chatgpt"
  if (providerId.includes(' + ')) {
    return providerId
      .split(' + ')
      .map((p) => getProviderDisplayName(p.trim(), servicesManifest, providers))
      .join(' + ');
  }
  if (providerId.includes('+')) {
    return providerId
      .split('+')
      .map((p) => getProviderDisplayName(p.trim(), servicesManifest, providers))
      .join(' + ');
  }

  const rawId = providerId.trim();
  const lower = rawId.toLowerCase();

  // 2. Direct standard overrides
  if (lower === 'localllm' || lower === 'local_llm' || lower === 'local') {
    return 'Local LLM';
  }
  if (lower === 'chatgpt') {
    return 'ChatGPT';
  }
  if (lower === 'claude') {
    return 'Claude';
  }
  if (lower === 'gemini') {
    return 'Gemini';
  }
  if (lower === 'grok') {
    return 'Grok';
  }

  // 3. Search in servicesManifest
  if (servicesManifest?.services) {
    const sExact = servicesManifest.services[rawId];
    const sWithPrefix = servicesManifest.services[`webview_${rawId}`];
    const sWithoutPrefix = rawId.startsWith('webview_')
      ? servicesManifest.services[rawId.replace(/^webview_/, '')]
      : undefined;
    const entry = sExact || sWithPrefix || sWithoutPrefix;

    if (entry) {
      if (entry.name && !entry.name.toLowerCase().includes('experimental')) {
        return entry.name;
      }
      if (entry.url) {
        try {
          const u = new URL(entry.url);
          if (u.hostname) return u.hostname;
        } catch {}
      }
      if (entry.name) {
        return entry.name;
      }
    }
  }

  // 4. Search in providers status map
  if (providers) {
    const pExact = providers[rawId];
    const pWithPrefix = providers[`webview_${rawId}`];
    const pWithoutPrefix = rawId.startsWith('webview_')
      ? providers[rawId.replace(/^webview_/, '')]
      : undefined;
    const pStatus = pExact || pWithPrefix || pWithoutPrefix;

    if (pStatus) {
      if (pStatus.name && !pStatus.name.toLowerCase().includes('experimental')) {
        return pStatus.name;
      }
      if (pStatus.url) {
        try {
          const u = new URL(pStatus.url);
          if (u.hostname) return u.hostname;
        } catch {}
      }
      if (pStatus.name) {
        return pStatus.name;
      }
    }
  }
  // 5. Generic webview fallback if hash not matched
  if (lower.startsWith('webview_')) {
    const hash = rawId.slice(8);
    return `Webview (${hash.slice(0, 8)}...)`;
  }

  return rawId;
}

