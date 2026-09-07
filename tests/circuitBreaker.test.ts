import { describe, it, expect, beforeEach } from 'vitest';
import { CircuitBreaker } from '../src/main/mcp/circuitBreaker.js';

describe('CircuitBreaker', () => {
  let cb: CircuitBreaker;

  beforeEach(() => {
    // 2 failure threshold, 2 second base cooldown, 10 second max
    cb = new CircuitBreaker(2, 2, 10);
  });

  it('should start in CLOSED state and allow attempts', () => {
    expect(cb.getState('claude')).toBe('CLOSED');
    expect(cb.canAttempt('claude')).toBe(true);
  });

  it('should remain CLOSED if failures are below threshold', () => {
    cb.recordFailure('claude', 'DOM timeout');
    expect(cb.getState('claude')).toBe('CLOSED');
    expect(cb.canAttempt('claude')).toBe(true);
  });

  it('should transition to OPEN state when failure threshold is reached', () => {
    cb.recordFailure('chatgpt', 'Timeout 1');
    cb.recordFailure('chatgpt', 'Timeout 2');

    expect(cb.getState('chatgpt')).toBe('OPEN');
    expect(cb.canAttempt('chatgpt')).toBe(false);
    expect(cb.getRemainingCooldown('chatgpt')).toBeGreaterThan(0);
  });

  it('should reset to CLOSED on successful execution', () => {
    cb.recordFailure('gemini', 'Error 1');
    expect(cb.getMetrics('gemini').consecutiveFailures).toBe(1);

    cb.recordSuccess('gemini');
    expect(cb.getMetrics('gemini').consecutiveFailures).toBe(0);
    expect(cb.getState('gemini')).toBe('CLOSED');
  });

  it('should support manual reset', () => {
    cb.recordFailure('grok', 'Err');
    cb.recordFailure('grok', 'Err');
    expect(cb.getState('grok')).toBe('OPEN');

    cb.reset('grok');
    expect(cb.getState('grok')).toBe('CLOSED');
    expect(cb.canAttempt('grok')).toBe(true);
  });
});
