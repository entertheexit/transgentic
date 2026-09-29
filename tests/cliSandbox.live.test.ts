import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { macSandboxProfile } from '../src/main/cli/executionPolicy.js';

const enabled = process.env.TRANSGENTIC_CLI_SANDBOX_TEST === '1' && process.platform === 'darwin';
describe.skipIf(!enabled)('real macOS CLI permission boundary', () => {
  let root: string; let scratch: string; let workspace: string; let executable: string;
  beforeAll(() => {
    root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'tg-cli-policy-')));
    scratch = path.join(root, 'runtime'); workspace = path.join(root, 'project');
    fs.mkdirSync(scratch); fs.mkdirSync(workspace);
    fs.writeFileSync(path.join(workspace, 'read.txt'), 'project');
    fs.writeFileSync(path.join(root, 'outside.txt'), 'outside');
    const source = path.join(scratch, 'probe.c'); executable = path.join(scratch, 'probe');
    fs.writeFileSync(source, '#include <stdio.h>\n#include <unistd.h>\n#include <string.h>\nint main(int n,char **v){if(n<3)return 3;if(!strcmp(v[1],"exec")){execl("/bin/sh","sh","-c","exit 0",NULL);return 4;}if(!strcmp(v[1],"auth")){execl("/usr/bin/security","security","help",NULL);return 4;}if(!strcmp(v[1],"shellwrite")){execl("/bin/sh","sh","-c","echo changed > \\\"$1\\\"","sh",v[2],NULL);return 4;}FILE *f=fopen(v[2],!strcmp(v[1],"write")?"w":"r");if(!f)return 2;fclose(f);return 0;}');
    execFileSync('/usr/bin/cc', [source, '-o', executable]);
  });
  afterAll(() => fs.rmSync(root, { recursive: true, force: true }));
  it.each([[false, false], [true, false], [false, true], [true, true]])('editing=%s commands=%s enforces actual reads, writes and exec', (editing, commands) => {
    const profile = macSandboxProfile(executable, { cwd: workspace, allowProjectEditing: editing, allowCommands: commands }, scratch, []);
    const run = (operation: string, target: string) => spawnSync('/usr/bin/sandbox-exec', ['-p', profile, executable, operation, target], { cwd: workspace }).status;
    expect(run('read', path.join(workspace, 'read.txt'))).toBe(0);
    expect(run('read', path.join(root, 'outside.txt'))).not.toBe(0);
    expect(run('write', path.join(workspace, 'output.txt')) === 0).toBe(editing);
    expect(run('write', path.join(root, 'escape.txt'))).not.toBe(0);
    expect(run('exec', 'unused') === 0).toBe(commands);
    expect(run('shellwrite', path.join(workspace, 'indirect.txt')) === 0).toBe(editing && commands);
    expect(run('write', executable)).not.toBe(0);
  });
  it('permits the fixed Keychain helper without permitting a shell', () => {
    const profile = macSandboxProfile(executable, { cwd: workspace, allowProjectEditing: false, allowCommands: false }, scratch, [], 58420, ['/usr/bin/security'], [path.join(os.homedir(), 'Library', 'Keychains', 'login.keychain-db')]);
    const run = (operation: string) => spawnSync('/usr/bin/sandbox-exec', ['-p', profile, executable, operation, 'unused'], { cwd: workspace }).status;
    expect(run('auth')).toBe(0);
    expect(run('exec')).not.toBe(0);
  });
  it('allows native thread locks and conversation annotations while protecting settings and plugins', () => {
    const storage = path.join(root, 'native-state');
    for (const directory of ['thread-writer-locks', 'annotations', 'plugins']) fs.mkdirSync(path.join(storage, directory), { recursive: true });
    const profile = macSandboxProfile(executable, { cwd: workspace, allowProjectEditing: false, allowCommands: false }, scratch, [storage]);
    const write = (target: string) => spawnSync('/usr/bin/sandbox-exec', ['-p', profile, executable, 'write', path.join(storage, target)], { cwd: workspace }).status;
    expect(write('thread-writer-locks/owned.lock')).toBe(0);
    expect(write('annotations/owned.pbtxt.tmp')).toBe(0);
    expect(write('settings.json')).not.toBe(0);
    expect(write('plugins/unsafe.js')).not.toBe(0);
  });
  it('confines a native companion to the same permissions and protects its binary', () => {
    const helper = path.join(root, 'native-helper');
    fs.copyFileSync(executable, helper);
    const profile = macSandboxProfile(executable, { cwd: workspace, allowProjectEditing: true, allowCommands: false }, scratch, [], 58420, [helper]);
    const run = (operation: string, target: string) => spawnSync('/usr/bin/sandbox-exec', ['-p', profile, helper, operation, target], { cwd: workspace }).status;
    expect(run('write', path.join(workspace, 'helper-edit.txt'))).toBe(0);
    expect(run('exec', 'unused')).not.toBe(0);
    expect(run('read', path.join(root, 'outside.txt'))).not.toBe(0);
    expect(run('write', helper)).not.toBe(0);
  });
});
