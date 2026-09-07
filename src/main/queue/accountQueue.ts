export interface QueueTask<T = any> {
  id: string;
  accountId: string;
  createdAt: number;
  execute: () => Promise<T>;
  resolve: (value: T | PromiseLike<T>) => void;
  reject: (reason?: any) => void;
}

export class AccountQueueManager {
  private static queues = new Map<string, QueueTask[]>();
  private static activeJobs = new Map<string, boolean>();
  private static activeSubmissions = new Set<string>(); // Exactly-one-submit guard

  /**
   * Enqueues an execution task for a specific account profile.
   * Guarantees concurrency = 1 per account profile with FIFO ordering.
   */
  public static async runTask<T>(
    accountId: string,
    submissionId: string,
    execute: () => Promise<T>
  ): Promise<T> {
    // Exactly-one-submit guard: prevent duplicate submission processing
    if (this.activeSubmissions.has(submissionId)) {
      throw new Error(`[AccountQueueManager] Duplicate submission rejected for ID: ${submissionId}`);
    }

    this.activeSubmissions.add(submissionId);

    return new Promise<T>((resolve, reject) => {
      const task: QueueTask<T> = {
        id: submissionId,
        accountId,
        createdAt: Date.now(),
        execute,
        resolve,
        reject,
      };

      if (!this.queues.has(accountId)) {
        this.queues.set(accountId, []);
      }

      this.queues.get(accountId)!.push(task);
      this.processNext(accountId);
    });
  }

  private static async processNext(accountId: string): Promise<void> {
    if (this.activeJobs.get(accountId)) {
      return; // Account is currently busy executing a task
    }

    const queue = this.queues.get(accountId);
    if (!queue || queue.length === 0) {
      return;
    }

    const task = queue.shift()!;
    this.activeJobs.set(accountId, true);

    try {
      const result = await task.execute();
      task.resolve(result);
    } catch (err) {
      task.reject(err);
    } finally {
      this.activeJobs.set(accountId, false);
      this.activeSubmissions.delete(task.id);
      // Process remaining items in FIFO queue
      setImmediate(() => this.processNext(accountId));
    }
  }

  /**
   * Get current queue depth for an account
   */
  public static getQueueDepth(accountId: string): number {
    const q = this.queues.get(accountId);
    const active = this.activeJobs.get(accountId) ? 1 : 0;
    return (q ? q.length : 0) + active;
  }

  /**
   * Clear queue for testing or reset
   */
  public static clear(): void {
    this.queues.clear();
    this.activeJobs.clear();
    this.activeSubmissions.clear();
  }

  public static clearAll(): void {
    this.clear();
  }
}
