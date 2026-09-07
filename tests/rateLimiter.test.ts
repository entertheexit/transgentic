import { describe, it, expect, beforeEach } from 'vitest';
import { AdaptiveRateLimiter } from '../src/main/mcp/rateLimiter.js';

describe('AdaptiveRateLimiter', () => {
  let limiter: AdaptiveRateLimiter;

  beforeEach(() => {
    limiter = new AdaptiveRateLimiter();
    limiter.reset();
  });

  it('should calculate jitter within expected ranges', () => {
    const textJitter = limiter.calculateJitterMs('coding');
    expect(textJitter).toBeGreaterThanOrEqual(3000);
    expect(textJitter).toBeLessThanOrEqual(8000);

    const mediaJitter = limiter.calculateJitterMs('image');
    expect(mediaJitter).toBeGreaterThanOrEqual(12000);
    expect(mediaJitter).toBeLessThanOrEqual(25000);
  });

  it('should track rate-limited state and calculate remaining cooldown', () => {
    expect(limiter.isRateLimited('claude')).toBe(false);

    limiter.markRateLimited('claude', 10);
    expect(limiter.isRateLimited('claude')).toBe(true);
    expect(limiter.getCooldownRemaining('claude')).toBeGreaterThan(0);
    expect(limiter.getCooldownRemaining('claude')).toBeLessThanOrEqual(10);
  });

  it('should enforce rolling hourly window limits', () => {
    limiter.setHourlyLimit('grok', 3);
    expect(limiter.isRateLimited('grok')).toBe(false);

    limiter.recordRequest('grok');
    limiter.recordRequest('grok');
    expect(limiter.isRateLimited('grok')).toBe(false);

    limiter.recordRequest('grok');
    // Reached 3 requests
    expect(limiter.isRateLimited('grok')).toBe(true);
    expect(limiter.getCooldownRemaining('grok')).toBeGreaterThan(0);
  });

  it('should reset failure counters on success', () => {
    limiter.markRateLimited('gemini', 5);
    expect(limiter.getStatus('gemini').consecutiveFailures).toBe(1);

    limiter.markSuccess('gemini');
    expect(limiter.getStatus('gemini').consecutiveFailures).toBe(0);
  });
});
