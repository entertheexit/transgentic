import {
  ProviderId,
  TaskMode,
  AgentHaltGuardConfig,
  DEFAULT_AGENT_HALT_GUARD,
  isAgentHaltGuardEnabled,
  RecallModesConfig,
  DEFAULT_RECALL_MODES,
  isRecallEnabledForMode,
  RecallConfig,
  ModePipelineConfig,
  RouteMatrix,
  doubleAgentConfig,
} from '../../shared/types.js';

export {
  AgentHaltGuardConfig,
  DEFAULT_AGENT_HALT_GUARD,
  isAgentHaltGuardEnabled,
  RecallModesConfig,
  DEFAULT_RECALL_MODES,
  isRecallEnabledForMode,
  RecallConfig,
  ModePipelineConfig,
  RouteMatrix,
  doubleAgentConfig,
};

export interface CodingModeConfig {
  balancedMode: boolean; // default: true
  primaryProvider: ProviderId;
  fallbackProviders: string[];
}

export interface LocalLLMConfig {
  enabled: boolean;                 // Master toggle (does not erase settings on false)
  preset: 'ollama' | 'lmstudio' | 'custom';
  baseUrl: string;                  // e.g. "http://127.0.0.1:11434"
  selectedModel: string;            // e.g. "qwen2.5-coder:7b", "deepseek-coder:6.7b"
  temperature: number;              // default: 0.2
  contextLength: number;            // default: 8192
  localMicroTask?: boolean;
  localZeroLeak?: boolean;
  localCompact?: boolean;
  completionCompact?: boolean;
  compactThresholdChars?: number;
}

export interface HealingConfig {
  autoHealingEnabled: boolean;      // Toggle in Settings
  checkIntervalMinutes: number;     // default: 60
  checkOnPageLoad: boolean;         // Run quick audit on did-finish-load
  checkModelSelector: boolean;      // default: true (Audit model switcher dropdowns)
}

export const DEFAULT_LOCAL_LLM_CONFIG: LocalLLMConfig = {
  enabled: false,
  preset: 'ollama',
  baseUrl: 'http://127.0.0.1:11434',
  selectedModel: '',
  temperature: 0.2,
  contextLength: 8192,
  localMicroTask: false,
  localZeroLeak: false,
  localCompact: false,
  completionCompact: false,
  compactThresholdChars: 4000,
};

export const DEFAULT_HEALING_CONFIG: HealingConfig = {
  autoHealingEnabled: true,
  checkIntervalMinutes: 60,
  checkOnPageLoad: true,
  checkModelSelector: true,
};

export interface AppConfig {
  activeMode: TaskMode;
  port: number;
  balancedMode: boolean;              // Synced between Hub header and Settings
  doubleAgent: doubleAgentConfig;
  routes: RouteMatrix;
  coding: CodingModeConfig;
  recall?: RecallConfig;
  agentHaltGuard?: AgentHaltGuardConfig | boolean;
  localLLM: LocalLLMConfig;
  healing: HealingConfig;
  interMessageCooldownMs?: number;
  textJitterMinMs?: number;
  textJitterMaxMs?: number;
  mediaJitterMinMs?: number;
  mediaJitterMaxMs?: number;
  autoFallbackEnabled?: boolean;
  dataBlindingEnabled?: boolean;
  assetsDir?: string;
}
