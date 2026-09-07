import { describe, it, expect } from 'vitest';
import {
  getProviderIconComponent,
  getProviderTheme,
  getProviderThemeFromManifest,
  getProviderDisplayName,
  ICON_REGISTRY,
} from '../src/renderer/utils/providerTheme.js';
import { Bot, Brain, Sparkles, Cpu, Flame, Zap, Globe, FlaskConical, Braces } from 'lucide-react';
import { ServiceManifestEntry, ServicesManifest } from '../src/shared/types.js';

describe('ProviderTheme Engine', () => {
  it('should resolve standard icons from registry by name', () => {
    expect(getProviderIconComponent('Bot')).toBe(Bot);
    expect(getProviderIconComponent('Brain')).toBe(Brain);
    expect(getProviderIconComponent('Sparkles')).toBe(Sparkles);
    expect(getProviderIconComponent('Cpu')).toBe(Cpu);
    expect(getProviderIconComponent('Flame')).toBe(Flame);
    expect(getProviderIconComponent('Zap')).toBe(Zap);
    expect(getProviderIconComponent('Globe')).toBe(Globe);
    expect(getProviderIconComponent('FlaskConical')).toBe(FlaskConical);
    expect(getProviderIconComponent('lab')).toBe(FlaskConical);
    expect(getProviderIconComponent('Braces')).toBe(Braces);
    expect(getProviderIconComponent('braces')).toBe(Braces);
  });

  it('should fallback to provider default icon if iconName is missing or unknown', () => {
    expect(getProviderIconComponent(undefined, 'claude')).toBe(Brain);
    expect(
      getProviderIconComponent(
        undefined,
        'webview_custom_portal' as any
      )
    ).toBe(Globe);
    expect(getProviderIconComponent(undefined, 'api_12345' as any)).toBe(Braces);
    expect(getProviderIconComponent('NonExistentIcon', 'gemini')).toBe(Sparkles);
    expect(getProviderIconComponent('NonExistentIcon', undefined)).toBe(Bot);
  });

  it('should resolve default themes for all providers including custom webview', () => {
    const chatgptTheme = getProviderTheme('chatgpt', null);
    expect(chatgptTheme.accentColor).toBe('emerald');
    expect(chatgptTheme.textClass).toBe('text-emerald-400');
    expect(chatgptTheme.bgClass).toBe('bg-emerald-500/10');
    expect(chatgptTheme.borderClass).toBe('border-emerald-500/30');

    const claudeTheme = getProviderTheme('claude', null);
    expect(claudeTheme.accentColor).toBe('amber');
    expect(claudeTheme.textClass).toBe('text-amber-400');

    const geminiTheme = getProviderTheme('gemini', null);
    expect(geminiTheme.accentColor).toBe('blue');
    expect(geminiTheme.textClass).toBe('text-blue-400');

    const grokTheme = getProviderTheme('grok', null);
    expect(grokTheme.accentColor).toBe('purple');
    expect(grokTheme.textClass).toBe('text-purple-400');

    const expTheme = getProviderTheme(
      'webview_custom_portal' as any,
      null
    );
    expect(expTheme.accentColor).toBe('teal');
    expect(expTheme.textClass).toBe('text-teal-400');
    expect(expTheme.icon).toBe(Globe);

    const apiTheme = getProviderTheme('api_deepseek' as any, null);
    expect(apiTheme.accentColor).toBe('cyan');
    expect(apiTheme.textClass).toBe('text-cyan-400');
    expect(apiTheme.icon).toBe(Braces);
  });

  it('should override icon and Tailwind classes when specified in manifest entry', () => {
    const customEntry: ServiceManifestEntry = {
      id: 'chatgpt',
      name: 'Custom ChatGPT',
      company: 'OpenAI',
      enabled: true,
      url: 'https://chatgpt.com',
      partition: 'persist:chatgpt',
      defaultModelId: 'gpt-4o',
      iconName: 'Flame',
      accentColor: 'rose',
      theme: {
        iconName: 'Flame',
        accentColor: 'rose',
        textClass: 'text-rose-400',
        bgClass: 'bg-rose-500/20',
        borderClass: 'border-rose-500/40',
        badgeClass: 'bg-rose-500/20 text-rose-300',
        glowClass: 'shadow-[0_0_20px_rgba(244,63,94,0.3)]',
      },
      models: [],
    };

    const resolved = getProviderTheme('chatgpt', customEntry);
    expect(resolved.icon).toBe(Flame);
    expect(resolved.accentColor).toBe('rose');
    expect(resolved.textClass).toBe('text-rose-400');
    expect(resolved.bgClass).toBe('bg-rose-500/20');
    expect(resolved.borderClass).toBe('border-rose-500/40');
    expect(resolved.glowClass).toBe('shadow-[0_0_20px_rgba(244,63,94,0.3)]');
  });

  it('should resolve theme directly from full ServicesManifest', () => {
    const manifest: ServicesManifest = {
      version: '1.0.0',
      services: {
        chatgpt: {
          id: 'chatgpt',
          name: 'ChatGPT',
          company: 'OpenAI',
          enabled: true,
          url: 'https://chatgpt.com',
          partition: 'persist:chatgpt',
          defaultModelId: 'gpt-4o',
          accentColor: 'cyan',
          iconName: 'Zap',
          models: [],
        },
        claude: {
          id: 'claude',
          name: 'Claude',
          company: 'Anthropic',
          enabled: true,
          url: 'https://claude.ai',
          partition: 'persist:claude',
          defaultModelId: 'claude-3-5-sonnet',
          models: [],
        },
        gemini: {
          id: 'gemini',
          name: 'Gemini',
          company: 'Google',
          enabled: true,
          url: 'https://gemini.google.com/app',
          partition: 'persist:gemini',
          defaultModelId: 'gemini-2-0-flash',
          models: [],
        },
        grok: {
          id: 'grok',
          name: 'Grok',
          company: 'xAI',
          enabled: true,
          url: 'https://grok.com',
          partition: 'persist:grok',
          defaultModelId: 'grok-3',
          models: [],
        },
      },
    };

    const chatgptTheme = getProviderThemeFromManifest('chatgpt', manifest);
    expect(chatgptTheme.icon).toBe(Zap);
    expect(chatgptTheme.accentColor).toBe('cyan');
    expect(chatgptTheme.textClass).toBe('text-cyan-400');
  });

  describe('getProviderDisplayName', () => {
    it('should format standard built-in providers with proper titles', () => {
      expect(getProviderDisplayName('localllm')).toBe('Local LLM');
      expect(getProviderDisplayName('local_llm')).toBe('Local LLM');
      expect(getProviderDisplayName('local')).toBe('Local LLM');
      expect(getProviderDisplayName('chatgpt')).toBe('ChatGPT');
      expect(getProviderDisplayName('claude')).toBe('Claude');
      expect(getProviderDisplayName('gemini')).toBe('Gemini');
      expect(getProviderDisplayName('grok')).toBe('Grok');
    });

    it('should handle compound/dual-dispatch provider combinations', () => {
      expect(getProviderDisplayName('localllm + chatgpt')).toBe('Local LLM + ChatGPT');
      expect(getProviderDisplayName('chatgpt + claude')).toBe('ChatGPT + Claude');
      expect(getProviderDisplayName('gemini+grok')).toBe('Gemini + Grok');
    });

    it('should match webview identifier against servicesManifest and return title/domain', () => {
      const manifest: ServicesManifest = {
        version: '1.0.0',
        services: {
          webview_custom_portal: {
            id: 'webview_custom_portal' as any,
            name: 'Custom AI Portal',
            company: 'Custom',
            enabled: true,
            url: 'https://custom-ai.example.com/chat',
            partition: 'persist:custom',
            defaultModelId: 'custom-model',
            models: [],
          },
        },
      };

      const title = getProviderDisplayName(
        'webview_custom_portal' as any,
        manifest
      );
      expect(title).toBe('Custom AI Portal');
    });

    it('should extract hostname when name contains legacy experimental term', () => {
      const manifest: ServicesManifest = {
        version: '1.0.0',
        services: {
          webview_custom_portal: {
            id: 'webview_custom_portal' as any,
            name: 'Experimental Webview',
            company: 'Sample Org',
            enabled: true,
            url: 'https://ai-hub.sample.org/chat',
            partition: 'persist:custom',
            defaultModelId: 'custom-model',
            models: [],
          },
        },
      };

      const title = getProviderDisplayName(
        'webview_custom_portal' as any,
        manifest
      );
      expect(title).toBe('ai-hub.sample.org');
    });

    it('should match webview identifier from providers status map', () => {
      const providers: any = {
        webview_custom_portal: {
          id: 'webview_custom_portal',
          name: 'Synced Workspace AI',
          url: 'https://workspace.test',
        },
      };

      const title = getProviderDisplayName(
        'webview_custom_portal' as any,
        null,
        providers
      );
      expect(title).toBe('Synced Workspace AI');
    });

    it('should gracefully format unmatched webview identifier', () => {
      const title = getProviderDisplayName('webview_abcdef1234567890abcdef');
      expect(title).toBe('Webview (abcdef12...)');
    });
  });
});
