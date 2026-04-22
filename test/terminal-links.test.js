import assert from 'node:assert/strict';
import test from 'node:test';

import {
  blue,
  commandBox,
  green,
  supportsTerminalColors,
  supportsTerminalLinks,
  terminalLink,
} from '../src/terminal-links.js';
import { withEnv } from '../test-support/helpers.js';

test('supportsTerminalColors respects tty and explicit env overrides', async () => {
  const ttyStream = { isTTY: true };

  await withEnv({ NO_COLOR: '1', FORCE_COLOR: null, TERM: 'xterm-256color' }, async () => {
    assert.equal(supportsTerminalColors(ttyStream), false);
  });

  await withEnv({ NO_COLOR: null, FORCE_COLOR: '1', TERM: 'dumb' }, async () => {
    assert.equal(supportsTerminalColors(ttyStream), true);
    assert.match(green('ok', { stream: ttyStream }), /\u001B\[92mok\u001B\[39m/);
  });
});

test('terminalLink falls back when links are disabled and emits OSC links when forced', async () => {
  const ttyStream = { isTTY: true };

  await withEnv({
    STACKNODO_DISABLE_TERMINAL_LINKS: '1',
    STACKNODO_FORCE_TERMINAL_LINKS: null,
    FORCE_COLOR: '0',
  }, async () => {
    assert.equal(supportsTerminalLinks(ttyStream), false);
    assert.equal(terminalLink('Docs', 'https://docs.stacknodo.com', {
      stream: ttyStream,
      fallback: 'fallback-url',
    }), 'fallback-url');
  });

  await withEnv({
    STACKNODO_DISABLE_TERMINAL_LINKS: null,
    STACKNODO_FORCE_TERMINAL_LINKS: '1',
    FORCE_COLOR: '1',
  }, async () => {
    assert.equal(supportsTerminalLinks(ttyStream), true);
    assert.match(
      terminalLink('Docs', 'https://docs.stacknodo.com', { stream: ttyStream }),
      /\u001B]8;;https:\/\/docs\.stacknodo\.com\u0007Docs\u001B]8;;\u0007/,
    );
    assert.match(blue('sdk', { stream: ttyStream }), /\u001B\[94msdk\u001B\[39m/);
    assert.match(commandBox('npx stacknodo agent install', { stream: ttyStream }), /npx stacknodo agent install/);
  });
});