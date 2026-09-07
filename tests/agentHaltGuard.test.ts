import { describe, it, expect } from 'vitest';
import { isAgentHaltGuardEnabled, DEFAULT_AGENT_HALT_GUARD, TransgenticConfig } from '../src/shared/types.js';
import {
  formatAgentHaltDirective,
  estimateCooldownString,
  createAgentHaltResponse,
} from '../src/main/mcp/handlers/errorHandler.js';

describe('Agent Halt Guard', () => {
  it('should default to enabled (true) for all modes', () => {
    const config: TransgenticConfig = {
      port: 58420,
      defaultMode: 'general',
      interMessageCooldownMs: 6000,
      textJitterMinMs: 3000,
      textJitterMaxMs: 8000,
      mediaJitterMinMs: 12000,
      mediaJitterMaxMs: 25000,
      autoFallbackEnabled: true,
      dataBlindingEnabled: true,
      assetsDir: '',
    };

    expect(isAgentHaltGuardEnabled(config, 'general')).toBe(true);
    expect(isAgentHaltGuardEnabled(config, 'coding')).toBe(true);
    expect(isAgentHaltGuardEnabled(config, 'image')).toBe(true);
    expect(isAgentHaltGuardEnabled(config, 'video')).toBe(true);
    expect(isAgentHaltGuardEnabled(config, 'writing')).toBe(true);
    expect(isAgentHaltGuardEnabled(config, 'audio')).toBe(true);
    expect(isAgentHaltGuardEnabled(undefined, 'coding')).toBe(true);
  });

  it('should support granular per-mode configuration', () => {
    const config: TransgenticConfig = {
      port: 58420,
      defaultMode: 'general',
      interMessageCooldownMs: 6000,
      textJitterMinMs: 3000,
      textJitterMaxMs: 8000,
      mediaJitterMinMs: 12000,
      mediaJitterMaxMs: 25000,
      autoFallbackEnabled: true,
      dataBlindingEnabled: true,
      assetsDir: '',
      agentHaltGuard: {
        general: true,
        coding: false,
        image: true,
        video: false,
        writing: true,
        audio: true,
      },
    };

    expect(isAgentHaltGuardEnabled(config, 'coding')).toBe(false);
    expect(isAgentHaltGuardEnabled(config, 'video')).toBe(false);
    expect(isAgentHaltGuardEnabled(config, 'general')).toBe(true);
    expect(isAgentHaltGuardEnabled(config, 'image')).toBe(true);
  });

  it('should format exact critical directive text on rate limit', () => {
    const directive = formatAgentHaltDirective('ChatGPT', 'in ~2m');
    expect(directive).toContain('[CRITICAL DIRECTIVE: RATE LIMIT HALT (TRANSGENTIC MCP)]');
    expect(directive).toContain("Provider 'ChatGPT' is currently rate-limited (Estimated reset: in ~2m).");
    expect(directive).toContain('MANDATORY AGENT BEHAVIOR:');
    expect(directive).toContain('- Stop execution immediately.');
    expect(directive).toContain('- Do not retry or call alternative tools autonomously.');
    expect(directive).toContain('- Summarize current progress and prompt the human user for their preferred next step, or fallback to local agentic execution.');
  });

  it('should generate MCP error response with isError: true and directive', () => {
    const res = createAgentHaltResponse('Grok', 'in 45s');
    expect(res.isError).toBe(true);
    expect(res.content).toHaveLength(1);
    expect(res.content[0].text).toContain('[CRITICAL DIRECTIVE: RATE LIMIT HALT (TRANSGENTIC MCP)]');
    expect(res.content[0].text).toContain("Provider 'Grok'");
  });

  it('should estimate reset cooldown strings properly', () => {
    expect(estimateCooldownString(undefined)).toBe('in ~1-5m');
    const futureSec = Date.now() + 30 * 1000;
    expect(estimateCooldownString(futureSec)).toBe('in 30s');
    const futureMin = Date.now() + 180 * 1000;
    expect(estimateCooldownString(futureMin)).toBe('in ~3m');
  });
});
