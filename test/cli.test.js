import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const testDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(testDir, '..');
const cliPath = path.join(repoRoot, 'src', 'cli.js');

function runCli(args, options = {}) {
  return execFileSync(process.execPath, [cliPath, ...args], {
    cwd: repoRoot,
    encoding: 'utf8',
    env: {
      ...process.env,
      FORCE_COLOR: '0',
      STACKNODO_DISABLE_TERMINAL_LINKS: '1',
    },
    ...options,
  });
}

test('cli help prints usage and doc links', () => {
  const output = runCli(['--help']);

  assert.match(output, /Stacknodo CLI/);
  assert.match(output, /stacknodo agent install/);
  assert.match(output, /https:\/\/docs\.stacknodo\.com\/#sdk/);
});

test('cli agent path prints the bundled skill directory', () => {
  const output = runCli(['agent', 'path']).trim();

  assert.equal(output, path.join(repoRoot, '.agents', 'skills', 'stacknodo-sdk'));
});

test('cli agent install copies the bundled skill into a destination root', (t) => {
  const tempDir = mkdtempSync(path.join(os.tmpdir(), 'stacknodo-sdk-test-'));
  t.after(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  const output = runCli(['agent', 'install', '--dest', tempDir]);
  const installedSkill = path.join(tempDir, '.agents', 'skills', 'stacknodo-sdk', 'SKILL.md');

  assert.match(output, /Installed Stacknodo agent skills/);
  assert.equal(existsSync(installedSkill), true);
});

test('cli exits non-zero for unknown commands', () => {
  const result = spawnSync(process.execPath, [cliPath, 'unknown'], {
    cwd: repoRoot,
    encoding: 'utf8',
    env: {
      ...process.env,
      FORCE_COLOR: '0',
      STACKNODO_DISABLE_TERMINAL_LINKS: '1',
    },
  });

  assert.equal(result.status, 1);
  assert.match(result.stderr, /Unknown command: unknown/);
});