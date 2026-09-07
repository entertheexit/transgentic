import { describe, it, expect, beforeEach } from 'vitest';
import { AccountQueueManager } from '../src/main/queue/accountQueue.js';

describe('AccountQueueManager', () => {
  beforeEach(() => {
    AccountQueueManager.clearAll();
  });

  it('should enforce concurrency-1 execution per account profile', async () => {
    const accountId = 'acc_claude_01';
    let runningConcurrent = 0;
    let maxObservedConcurrent = 0;
    const executionOrder: number[] = [];

    const makeTask = (id: number, delayMs: number) => {
      return AccountQueueManager.runTask(accountId, `task_${id}`, async () => {
        runningConcurrent++;
        if (runningConcurrent > maxObservedConcurrent) {
          maxObservedConcurrent = runningConcurrent;
        }
        await new Promise((r) => setTimeout(r, delayMs));
        executionOrder.push(id);
        runningConcurrent--;
        return id;
      });
    };

    const results = await Promise.all([
      makeTask(1, 40),
      makeTask(2, 20),
      makeTask(3, 10),
    ]);

    expect(results).toEqual([1, 2, 3]);
    expect(maxObservedConcurrent).toBe(1);
    expect(executionOrder).toEqual([1, 2, 3]); // strictly FIFO
  });

  it('should prevent duplicate task submissions with identical submission IDs', async () => {
    const accountId = 'acc_chatgpt_01';
    const submissionId = 'req_unique_001';

    let taskCalls = 0;
    const taskPromise = AccountQueueManager.runTask(accountId, submissionId, async () => {
      taskCalls++;
      await new Promise((r) => setTimeout(r, 50));
      return 'done';
    });

    // Attempt concurrent re-submission with identical ID
    await expect(
      AccountQueueManager.runTask(accountId, submissionId, async () => {
        taskCalls++;
        return 'duplicate';
      })
    ).rejects.toThrow('Duplicate submission');

    const result = await taskPromise;
    expect(result).toBe('done');
    expect(taskCalls).toBe(1);
  });

  it('should isolate queues between distinct accounts', async () => {
    const accountA = 'acc_claude_main';
    const accountB = 'acc_claude_backup';

    let runningA = 0;
    let runningB = 0;
    let maxOverallConcurrent = 0;

    const taskA = AccountQueueManager.runTask(accountA, 'sub_a', async () => {
      runningA++;
      maxOverallConcurrent = Math.max(maxOverallConcurrent, runningA + runningB);
      await new Promise((r) => setTimeout(r, 30));
      runningA--;
      return 'a';
    });

    const taskB = AccountQueueManager.runTask(accountB, 'sub_b', async () => {
      runningB++;
      maxOverallConcurrent = Math.max(maxOverallConcurrent, runningA + runningB);
      await new Promise((r) => setTimeout(r, 30));
      runningB--;
      return 'b';
    });

    const results = await Promise.all([taskA, taskB]);
    expect(results).toEqual(['a', 'b']);
    // Different accounts can run in parallel
    expect(maxOverallConcurrent).toBe(2);
  });
});
