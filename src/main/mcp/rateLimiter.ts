import { ProviderId, TaskMode, TransgenticConfig } from '../../shared/types.js';
import { globalCircuitBreaker } from './circuitBreaker.js';

interface ProviderRateStatus {
  rateLimitedUntil: number;
  rateLimitCount: number;
  consecutiveFailures: number;
  lastUsed: number;
  hourlyRequests: number;
  hourlyLimit: number;
  cooldownSeconds: number;
}

export class AdaptiveRateLimiter {
  private statusMap: Map<ProviderId, ProviderRateStatus> = new Map([
    ['chatgpt', { rateLimitedUntil: 0, rateLimitCount: 0, consecutiveFailures: 0, lastUsed: 0, hourlyRequests: 0, hourlyLimit: 30, cooldownSeconds: 6 }],
    ['claude', { rateLimitedUntil: 0, rateLimitCount: 0, consecutiveFailures: 0, lastUsed: 0, hourlyRequests: 0, hourlyLimit: 35, cooldownSeconds: 6 }],
    ['gemini', { rateLimitedUntil: 0, rateLimitCount: 0, consecutiveFailures: 0, lastUsed: 0, hourlyRequests: 0, hourlyLimit: 50, cooldownSeconds: 5 }],
    ['grok', { rateLimitedUntil: 0, rateLimitCount: 0, consecutiveFailures: 0, lastUsed: 0, hourlyRequests: 0, hourlyLimit: 40, cooldownSeconds: 6 }],
  ]);

  // Rolling request timestamps for sliding 1-hour window
  private requestHistory: Map<ProviderId, number[]> = new Map([
    ['chatgpt', []],
    ['claude', []],
    ['gemini', []],
    ['grok', []],
  ]);

  public interMessageCooldownMs = 6000;
  public textJitterMinMs = 3000;
  public textJitterMaxMs = 8000;
  public mediaJitterMinMs = 12000;
  public mediaJitterMaxMs = 25000;
  public windowDurationMs = 60 * 60 * 1000; // 1 hour

  private lastGlobalRequestTime = 0;

  /**
   * Applies user configuration and dynamic limits.
   */
  public updateConfig(
    cfg: Partial<TransgenticConfig>,
    providerLimits?: Partial<Record<ProviderId, { hourlyLimit?: number; cooldownSeconds?: number }>>
  ): void {
    if (cfg.interMessageCooldownMs !== undefined) this.interMessageCooldownMs = cfg.interMessageCooldownMs;
    if (cfg.textJitterMinMs !== undefined) this.textJitterMinMs = cfg.textJitterMinMs;
    if (cfg.textJitterMaxMs !== undefined) this.textJitterMaxMs = cfg.textJitterMaxMs;
    if (cfg.mediaJitterMinMs !== undefined) this.mediaJitterMinMs = cfg.mediaJitterMinMs;
    if (cfg.mediaJitterMaxMs !== undefined) this.mediaJitterMaxMs = cfg.mediaJitterMaxMs;

    if (providerLimits) {
      for (const [p, limits] of Object.entries(providerLimits)) {
        const prov = p as ProviderId;
        const status = this.statusMap.get(prov);
        if (status && limits) {
          if (limits.hourlyLimit !== undefined && limits.hourlyLimit > 0) {
            status.hourlyLimit = limits.hourlyLimit;
          }
          if (limits.cooldownSeconds !== undefined && limits.cooldownSeconds >= 0) {
            status.cooldownSeconds = limits.cooldownSeconds;
          }
        }
      }
    }
  }

  /**
   * Calculates random jitter delay based on task mode.
   */
  public calculateJitterMs(mode: TaskMode): number {
    const isMedia = mode === 'image' || mode === 'video' || mode === 'audio' || (mode as any) === 'music';
    const min = isMedia ? this.mediaJitterMinMs : this.textJitterMinMs;
    const max = isMedia ? this.mediaJitterMaxMs : this.textJitterMaxMs;
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  /**
   * Enforces inter-message cooldowns and applies human-simulation jitter.
   */
  public async applyJitter(mode: TaskMode, provider?: ProviderId): Promise<number> {
    let totalDelayMs = 0;
    const now = Date.now();

    // 1. Inter-Message Cooldown Guardrail (prevents rapid-fire loops and bot detection)
    const requiredCooldownMs = provider && this.statusMap.get(provider)?.cooldownSeconds
      ? this.statusMap.get(provider)!.cooldownSeconds * 1000
      : this.interMessageCooldownMs;

    const lastUsedTime = provider && this.statusMap.get(provider)?.lastUsed
      ? this.statusMap.get(provider)!.lastUsed
      : this.lastGlobalRequestTime;

    const timeSinceLast = now - lastUsedTime;
    if (lastUsedTime > 0 && timeSinceLast < requiredCooldownMs) {
      const cooldownWait = requiredCooldownMs - timeSinceLast;
      await new Promise((resolve) => setTimeout(resolve, cooldownWait));
      totalDelayMs += cooldownWait;
    }

    // 2. Human Behavior Randomized Jitter (3-8s text, 12-25s media)
    const jitterMs = this.calculateJitterMs(mode);
    await new Promise((resolve) => setTimeout(resolve, jitterMs));
    totalDelayMs += jitterMs;

    return totalDelayMs;
  }

  /**
   * Cleans timestamps outside of the 1-hour rolling window.
   */
  private pruneWindow(provider: ProviderId): number[] {
    const now = Date.now();
    const history = this.requestHistory.get(provider) || [];
    const valid = history.filter((ts) => now - ts < this.windowDurationMs);
    this.requestHistory.set(provider, valid);

    const status = this.statusMap.get(provider);
    if (status) {
      status.hourlyRequests = valid.length;
    }
    return valid;
  }

  /**
   * Records a request dispatch into the provider's rolling window.
   */
  public recordRequest(provider: ProviderId): void {
    const now = Date.now();
    const history = this.pruneWindow(provider);
    history.push(now);
    this.requestHistory.set(provider, history);

    this.lastGlobalRequestTime = now;
    const status = this.statusMap.get(provider);
    if (status) {
      status.hourlyRequests = history.length;
      status.lastUsed = now;
    }
  }

  /**
   * Checks if provider is rate-limited via explicit cooldown, circuit breaker,
   * or rolling 1-hour quota exhaustion.
   */
  public isRateLimited(provider: ProviderId): boolean {
    const status = this.statusMap.get(provider);
    if (!status) return false;

    // 1. Explicit cooldown timer
    if (Date.now() < status.rateLimitedUntil) {
      return true;
    }

    // 2. Circuit breaker state
    if (!globalCircuitBreaker.canAttempt(provider)) {
      return true;
    }

    // 3. Rolling hourly window limit
    const history = this.pruneWindow(provider);
    if (history.length >= status.hourlyLimit) {
      return true;
    }

    return false;
  }

  /**
   * Returns cooldown time in seconds remaining for a provider.
   */
  public getCooldownRemaining(provider: ProviderId): number {
    const status = this.statusMap.get(provider);
    if (!status) return 0;

    let remainingSec = 0;

    // Check explicit cooldown
    const explicitDiffMs = status.rateLimitedUntil - Date.now();
    if (explicitDiffMs > 0) {
      remainingSec = Math.max(remainingSec, Math.ceil(explicitDiffMs / 1000));
    }

    // Check circuit breaker cooldown
    const circuitRemaining = globalCircuitBreaker.getRemainingCooldown(provider);
    if (circuitRemaining > 0) {
      remainingSec = Math.max(remainingSec, circuitRemaining);
    }

    // Check hourly rolling window
    const history = this.pruneWindow(provider);
    if (history.length >= status.hourlyLimit && history.length > 0) {
      const oldest = history[0];
      const windowExpiry = oldest + this.windowDurationMs;
      const hourlyDiffMs = windowExpiry - Date.now();
      if (hourlyDiffMs > 0) {
        remainingSec = Math.max(remainingSec, Math.ceil(hourlyDiffMs / 1000));
      }
    }

    return remainingSec;
  }

  /**
   * Mark a provider as rate-limited with exponential or configured backoff.
   */
  public markRateLimited(provider: ProviderId, cooldownSeconds?: number, reason?: string): void {
    const status = this.statusMap.get(provider) || {
      rateLimitedUntil: 0,
      rateLimitCount: 0,
      consecutiveFailures: 0,
      lastUsed: Date.now(),
      hourlyRequests: 0,
      hourlyLimit: 30,
      cooldownSeconds: 6,
    };

    status.rateLimitCount++;
    status.consecutiveFailures++;

    // Default backoff: 30s for 1st rate limit, 60s for 2nd, 180s for 3rd+
    const defaultCooldown = Math.min(30 * Math.pow(2, status.consecutiveFailures - 1), 300);
    const duration = (cooldownSeconds ?? defaultCooldown) * 1000;

    status.rateLimitedUntil = Date.now() + duration;
    this.statusMap.set(provider, status);

    globalCircuitBreaker.recordFailure(provider, reason || 'Rate limit triggered');
  }

  /**
   * Resets consecutive failure counter on successful response.
   */
  public markSuccess(provider: ProviderId): void {
    const status = this.statusMap.get(provider);
    if (status) {
      status.consecutiveFailures = 0;
      status.lastUsed = Date.now();
      globalCircuitBreaker.recordSuccess(provider);
    }
  }

  /**
   * Returns current rate limiting status and metrics for a provider.
   */
  public getStatus(provider: ProviderId): ProviderRateStatus {
    this.pruneWindow(provider);
    return (
      this.statusMap.get(provider) || {
        rateLimitedUntil: 0,
        rateLimitCount: 0,
        consecutiveFailures: 0,
        lastUsed: 0,
        hourlyRequests: 0,
        hourlyLimit: 30,
        cooldownSeconds: 6,
      }
    );
  }

  /**
   * Sets custom hourly limit for a provider.
   */
  public setHourlyLimit(provider: ProviderId, limit: number): void {
    const status = this.statusMap.get(provider);
    if (status && limit > 0) {
      status.hourlyLimit = limit;
    }
  }

  public reset(): void {
    this.resetAll();
  }

  /**
   * Resets all rate limits and rolling window history (useful for testing or user override).
   */
  public resetAll(): void {
    for (const [, status] of this.statusMap.entries()) {
      status.rateLimitedUntil = 0;
      status.consecutiveFailures = 0;
      status.rateLimitCount = 0;
      status.hourlyRequests = 0;
    }
    for (const [provider] of this.requestHistory.entries()) {
      this.requestHistory.set(provider, []);
    }
    globalCircuitBreaker.reset();
  }
}

export const globalRateLimiter = new AdaptiveRateLimiter();
