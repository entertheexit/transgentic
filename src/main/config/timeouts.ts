import { ProviderId, TaskMode, RouteMode, normalizeRouteMode } from '../../shared/types.js';

/**
 * Mode-Specific Dynamic Timeout Budgets (in milliseconds)
 * 
 * Allocated based on model workload characteristics:
 * - General / Fast Writing: 60s
 * - Balanced Coding / Deep Reasoning (o1, o3-mini, Claude Thinking, Grok Think): 300s (5 minutes)
 * - Image Generation (DALL-E 3, Imagen 3, Grok Imagine): 120s (2 minutes)
 * - Video / Audio / Music Generation: 420s (7 minutes)
 */
export const DEFAULT_TIMEOUT_BUDGETS: Record<RouteMode, number> = {
  general: 60_000,
  coding: 300_000,
  image: 120_000,
  video: 420_000,
  audio: 420_000,
};

export interface TimeoutSettings {
  modeBudgets?: Partial<Record<RouteMode, number>>;
  providerOverrides?: Partial<Record<ProviderId, Partial<Record<RouteMode, number>>>>;
}

export class TimeoutManager {
  private static customSettings: TimeoutSettings = {};

  public static configure(settings: TimeoutSettings): void {
    this.customSettings = { ...this.customSettings, ...settings };
  }

  public static getTimeout(mode: TaskMode, providerId?: ProviderId): number {
    const routeMode = normalizeRouteMode(mode);
    if (providerId && this.customSettings.providerOverrides?.[providerId]?.[routeMode]) {
      return this.customSettings.providerOverrides[providerId]![routeMode]!;
    }
    if (this.customSettings.modeBudgets?.[routeMode]) {
      return this.customSettings.modeBudgets[routeMode]!;
    }
    return DEFAULT_TIMEOUT_BUDGETS[routeMode] || 60_000;
  }
}
