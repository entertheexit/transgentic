import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it, expect, vi } from 'vitest';
import { CLI_IDS, type CliProviderId } from '../src/shared/cli.js';
import { globalCliRuntime } from '../src/main/cli/cliRuntimeManager.js';
vi.mock('electron', () => ({ app: undefined }));
const selected = process.env.TRANSGENTIC_CLI_LIVE;
describe.skipIf(!CLI_IDS.includes(selected as CliProviderId))('opt-in native CLI conversations', () => {
  it('executes a real answer and resumes only its explicit native session', async () => {
    const id = selected as CliProviderId;
    const key = `live_${Date.now()}`;
    globalCliRuntime.setConfig({ services: { [id]: { workMode: 'provider', allowCommands: false, allowProjectEditing: false, timeoutSeconds: 60 } }, workspaces: [] });
    try {
      const first = await globalCliRuntime.execute(id, 'Remember the word marigold. Reply with exactly that word.', { reqId: key + '_1', conversationKey: key, newThread: true });
      expect(first.text.toLowerCase()).toContain('marigold');
      const second = await globalCliRuntime.execute(id, 'What word did I ask you to remember? Reply with that word only.', { reqId: key + '_2', conversationKey: key });
      expect(second.text.toLowerCase()).toContain('marigold');
    } finally { globalCliRuntime.dispose(); globalCliRuntime.clearSessions(); }
  }, 130000);
  it('can edit a disposable project with commands still disabled', async () => {
    const id = selected as CliProviderId;
    const workspace = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'tg-native-edit-')));
    const key = `edit_${Date.now()}`;
    globalCliRuntime.setConfig({ services: { [id]: { workMode: 'agentic', allowCommands: false, allowProjectEditing: true, timeoutSeconds: 60 } }, workspaces: [{ id: key, path: workspace, name: 'Disposable test', allowMcp: false, grants: { [id]: { allowProjectEditing: true, allowCommands: false } } }] });
    try {
      await globalCliRuntime.execute(id, 'Create a file named verification.txt in the current project with exactly marigold as its content. Use your file editing tool. Do not run shell commands.', { reqId: key, conversationKey: key, newThread: true, desktop: true, request: { workspaceId: key } });
      expect(fs.readFileSync(path.join(workspace, 'verification.txt'), 'utf8').trim()).toBe('marigold');
    } finally { globalCliRuntime.dispose(); globalCliRuntime.clearSessions(); fs.rmSync(workspace, { recursive: true, force: true }); }
  }, 70000);
  it.skipIf(selected !== 'cli_codex')('runs a command while project editing remains disabled', async () => {
    const workspace = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'tg-native-command-')));
    const key = `command_${Date.now()}`;
    globalCliRuntime.setConfig({ services: { cli_codex: { workMode: 'agentic', allowCommands: true, allowProjectEditing: false, timeoutSeconds: 60 } }, workspaces: [{ id: key, path: workspace, name: 'Disposable command test', allowMcp: false, grants: { cli_codex: { allowProjectEditing: false, allowCommands: true } } }] });
    try {
      const result = await globalCliRuntime.execute('cli_codex', 'Run the shell command printf marigold and report its output. Do not create or edit any files.', { reqId: key, conversationKey: key, newThread: true, desktop: true, request: { workspaceId: key } });
      expect(result.text.toLowerCase()).toContain('marigold');
      expect(result.actions?.commands).toBeGreaterThan(0);
      expect(fs.readdirSync(workspace)).toEqual([]);
    } finally { globalCliRuntime.dispose(); globalCliRuntime.clearSessions(); fs.rmSync(workspace, { recursive: true, force: true }); }
  }, 70000);
});
