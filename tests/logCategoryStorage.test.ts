import { afterEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { PersistentLogStorage } from '../src/main/storage/logStorage.js';

describe('request log categories', () => {
  const roots: string[] = [];
  afterEach(() => { for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true }); });

  it('filters before pagination, clears only the selected category, and suppresses late pending updates', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'transgentic-log-categories-')); roots.push(root);
    const store = new PersistentLogStorage();
    (store as any).getStoragePath = () => path.join(root, 'request_logs.json');
    const normal = { id: 'normal', timestamp: 1, mode: 'general', targetProvider: 'grok', status: 'success', maskedSecretsCount: 0,
      promptSnippet: 'normal', promptText: 'normal full transcript', chatExecution: { policy: 'normal', actualMode: 'normal', verified: false } } as any;
    const temporary = { id: 'temporary', timestamp: 2, mode: 'general', targetProvider: 'grok', status: 'pending', maskedSecretsCount: 0,
      promptSnippet: 'temporary', promptText: 'temporary full transcript', chatExecution: { policy: 'prefer-temporary', actualMode: 'normal', verified: false, fallbackReason: 'unsupported' } } as any;
    store.insert(normal); store.insert(temporary);
    expect(store.query(1, 0, 'temporary')).toMatchObject({ total: 1, logs: [{ id: 'temporary', promptText: 'temporary full transcript' }] });
    expect(store.query(1, 0, 'normal')).toMatchObject({ total: 1, logs: [{ id: 'normal' }] });
    store.clear('temporary');
    store.update({ ...temporary, status: 'success', responseText: 'late answer' });
    expect(store.query(20, 0, 'temporary').total).toBe(0);
    expect(store.query(20, 0, 'normal').logs[0].promptText).toBe('normal full transcript');
    expect(JSON.parse(fs.readFileSync(path.join(root, 'request_logs.json'), 'utf8')).map((log: any) => log.id)).toEqual(['normal']);

    store.insert({ ...temporary, id: 'fallback', status: 'fallback' });
    store.clear('temporary');
    store.update({ ...temporary, id: 'fallback', status: 'success', responseText: 'late fallback answer' });
    expect(store.query(20, 0, 'temporary').total).toBe(0);
  });
});
