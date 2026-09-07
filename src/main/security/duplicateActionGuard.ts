import { ProviderId, TaskMode } from '../../shared/types.js';

export interface InFlightEntry<T = any> {
  reqId: string;
  providerId: ProviderId;
  mode: TaskMode;
  model: string;
  normalizedPrompt: string;
  createdAt: number;
  promise: Promise<T>;
}

export class DuplicateActionGuard {
  private static inFlightMap = new Map<string, InFlightEntry>();

  /**
   * Generates a deterministic deduplication key for a request.
   */
  public static generateKey(
    providerId: ProviderId,
    mode: TaskMode,
    model: string | undefined,
    prompt: string
  ): string {
    const normPrompt = (prompt || '').trim().replace(/\s+/g, ' ').toLowerCase();
    const normModel = (model || 'default').trim().toLowerCase();
    return `${providerId}::${mode}::${normModel}::${normPrompt}`;
  }

  /**
   * Checks if an identical request is currently in-flight.
   */
  public static getInFlight<T = any>(
    providerId: ProviderId,
    mode: TaskMode,
    model: string | undefined,
    prompt: string
  ): InFlightEntry<T> | undefined {
    const key = this.generateKey(providerId, mode, model, prompt);
    const entry = this.inFlightMap.get(key);
    if (entry) {
      // Safety watchdog: if an in-flight entry has been stuck for > 450s, invalidate it
      if (Date.now() - entry.createdAt > 450_000) {
        this.inFlightMap.delete(key);
        return undefined;
      }
      return entry as InFlightEntry<T>;
    }
    return undefined;
  }

  /**
   * Registers an active in-flight request.
   */
  public static register<T>(
    reqId: string,
    providerId: ProviderId,
    mode: TaskMode,
    model: string | undefined,
    prompt: string,
    promise: Promise<T>
  ): void {
    const key = this.generateKey(providerId, mode, model, prompt);
    this.inFlightMap.set(key, {
      reqId,
      providerId,
      mode,
      model: model || 'default',
      normalizedPrompt: (prompt || '').trim().replace(/\s+/g, ' ').toLowerCase(),
      createdAt: Date.now(),
      promise,
    });
  }

  /**
   * Unregisters an in-flight request upon completion or failure.
   */
  public static unregister(
    providerId: ProviderId,
    mode: TaskMode,
    model: string | undefined,
    prompt: string
  ): void {
    const key = this.generateKey(providerId, mode, model, prompt);
    this.inFlightMap.delete(key);
  }

  /**
   * Returns the count of currently active in-flight requests.
   */
  public static getActiveCount(): number {
    return this.inFlightMap.size;
  }

  /**
   * Clears all in-flight trackers (for testing or reset).
   */
  public static clear(): void {
    this.inFlightMap.clear();
  }
}
