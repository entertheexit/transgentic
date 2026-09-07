import { ProviderId } from '../../shared/types.js';

export type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

export interface CircuitMetrics {
  state: CircuitState;
  consecutiveFailures: number;
  lastFailureTime: number;
  openUntil: number;
  totalFailures: number;
  totalSuccesses: number;
  lastFailureReason?: string;
}

export class CircuitBreaker {
  private failureThreshold: number;
  private baseCooldownMs: number;
  private maxCooldownMs: number;
  private metrics: Map<ProviderId, CircuitMetrics> = new Map();

  constructor(failureThreshold = 3, baseCooldownSec = 30, maxCooldownSec = 300) {
    this.failureThreshold = failureThreshold;
    this.baseCooldownMs = baseCooldownSec * 1000;
    this.maxCooldownMs = maxCooldownSec * 1000;

    const providers: ProviderId[] = ['chatgpt', 'claude', 'gemini', 'grok'];
    for (const p of providers) {
      this.metrics.set(p, {
        state: 'CLOSED',
        consecutiveFailures: 0,
        lastFailureTime: 0,
        openUntil: 0,
        totalFailures: 0,
        totalSuccesses: 0,
      });
    }
  }

  /**
   * Returns current state for a provider, performing automatic state transition
   * from OPEN -> HALF_OPEN when the cooldown window has elapsed.
   */
  public getState(provider: ProviderId): CircuitState {
    const metric = this.metrics.get(provider);
    if (!metric) return 'CLOSED';

    if (metric.state === 'OPEN') {
      if (Date.now() >= metric.openUntil) {
        metric.state = 'HALF_OPEN';
      }
    }

    return metric.state;
  }

  /**
   * Determines if a request attempt is permitted for this provider.
   */
  public canAttempt(provider: ProviderId): boolean {
    const state = this.getState(provider);
    return state === 'CLOSED' || state === 'HALF_OPEN';
  }

  /**
   * Records a successful execution on the provider.
   * Resets consecutive failures and restores state to CLOSED.
   */
  public recordSuccess(provider: ProviderId): void {
    const metric = this.metrics.get(provider);
    if (metric) {
      metric.state = 'CLOSED';
      metric.consecutiveFailures = 0;
      metric.openUntil = 0;
      metric.totalSuccesses++;
    }
  }

  /**
   * Records a failure on the provider.
   * Increments consecutive failures and opens the circuit if threshold is reached.
   */
  public recordFailure(provider: ProviderId, reason?: string): void {
    let metric = this.metrics.get(provider);
    if (!metric) {
      metric = {
        state: 'CLOSED',
        consecutiveFailures: 0,
        lastFailureTime: 0,
        openUntil: 0,
        totalFailures: 0,
        totalSuccesses: 0,
      };
      this.metrics.set(provider, metric);
    }

    metric.consecutiveFailures++;
    metric.totalFailures++;
    metric.lastFailureTime = Date.now();
    metric.lastFailureReason = reason;

    if (metric.consecutiveFailures >= this.failureThreshold || metric.state === 'HALF_OPEN') {
      metric.state = 'OPEN';
      // Exponential backoff: baseCooldown * 2^(failures - 1)
      const multiplier = Math.pow(2, Math.max(0, metric.consecutiveFailures - this.failureThreshold));
      const cooldownMs = Math.min(this.baseCooldownMs * multiplier, this.maxCooldownMs);
      metric.openUntil = Date.now() + cooldownMs;
    }
  }

  /**
   * Returns remaining cooldown in seconds for an OPEN circuit.
   */
  public getRemainingCooldown(provider: ProviderId): number {
    const state = this.getState(provider);
    if (state !== 'OPEN') return 0;
    const metric = this.metrics.get(provider);
    if (!metric) return 0;
    const diff = metric.openUntil - Date.now();
    return diff > 0 ? Math.ceil(diff / 1000) : 0;
  }

  /**
   * Returns full metrics for a provider.
   */
  public getMetrics(provider: ProviderId): CircuitMetrics {
    this.getState(provider); // trigger automatic half-open evaluation
    return {
      ...(this.metrics.get(provider) || {
        state: 'CLOSED',
        consecutiveFailures: 0,
        lastFailureTime: 0,
        openUntil: 0,
        totalFailures: 0,
        totalSuccesses: 0,
      }),
    };
  }

  /**
   * Resets circuit breaker for a provider or all providers.
   */
  public reset(provider?: ProviderId): void {
    if (provider) {
      const metric = this.metrics.get(provider);
      if (metric) {
        metric.state = 'CLOSED';
        metric.consecutiveFailures = 0;
        metric.openUntil = 0;
      }
    } else {
      for (const metric of this.metrics.values()) {
        metric.state = 'CLOSED';
        metric.consecutiveFailures = 0;
        metric.openUntil = 0;
      }
    }
  }
}

export const globalCircuitBreaker = new CircuitBreaker();
