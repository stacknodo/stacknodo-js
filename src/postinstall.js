#!/usr/bin/env node

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { blue, commandBox, green, red, terminalLink, yellow } from './terminal-links.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const packageRoot = path.resolve(__dirname, '..');

const sdkDocsUrl = 'https://docs.stacknodo.com/#sdk';
const agentDocsUrl = 'https://docs.stacknodo.com/#agent-skills';
const agentInstallCommand = 'npx stacknodo agent install';

const sdkDocsLink = terminalLink('Open SDK docs ↗', sdkDocsUrl, { fallback: sdkDocsUrl });
const agentDocsLink = terminalLink('AI Coding Agent guide ↗', agentDocsUrl, { fallback: agentDocsUrl });
const agentInstallCommandBox = commandBox(agentInstallCommand);

const BLOCK_FONT = {
  A: [' ███ ', '█   █', '█████', '█   █', '█   █'],
  C: [' ████', '█    ', '█    ', '█    ', ' ████'],
  D: ['████ ', '█   █', '█   █', '█   █', '████ '],
  K: ['█   █', '█  █ ', '███  ', '█  █ ', '█   █'],
  N: ['█   █', '██  █', '█ █ █', '█  ██', '█   █'],
  O: [' ███ ', '█   █', '█   █', '█   █', ' ███ '],
  S: ['█████', '█    ', '████ ', '    █', '█████'],
  T: ['█████', '  █  ', '  █  ', '  █  ', '  █  '],
};

function renderBlockWord(word) {
  const rows = Array.from({ length: 5 }, () => []);

  for (const char of word.toUpperCase()) {
    const glyph = BLOCK_FONT[char];
    if (!glyph) throw new Error(`Missing block font glyph for ${char}`);
    glyph.forEach((segment, index) => rows[index].push(segment));
  }

  return rows.map((row) => row.join('  '));
}

function centerText(text, width) {
  const totalPadding = Math.max(0, width - text.length);
  const leftPadding = Math.floor(totalPadding / 2);
  const rightPadding = totalPadding - leftPadding;
  return `${' '.repeat(leftPadding)}${text}${' '.repeat(rightPadding)}`;
}

function renderWindowLine(text, width, colorize) {
  const centered = centerText(text, width);
  return `│ ${colorize ? colorize(centered) : centered} │`;
}

function renderPostinstallGraphic() {
  const titleText = '● ● ●  Welcome to Stacknodo SDK';
  const stackLines = renderBlockWord('STACK');
  const nodoLines = renderBlockWord('NODO');
  const footerText = 'Ship data, files, auth, and AI from one SDK.';
  const innerWidth = Math.max(
    titleText.length,
    footerText.length,
    ...stackLines.map((line) => line.length),
    ...nodoLines.map((line) => line.length),
  );
  const titlePadding = ' '.repeat(innerWidth - titleText.length);

  return [
    `┌${'─'.repeat(innerWidth + 2)}┐`,
    `│ ${red('●')} ${yellow('●')} ${green('●')}  Welcome to ${green('Stacknodo SDK')}${titlePadding} │`,
    `├${'─'.repeat(innerWidth + 2)}┤`,
    renderWindowLine('', innerWidth),
    ...stackLines.map((line) => renderWindowLine(line, innerWidth, green)),
    renderWindowLine('', innerWidth),
    ...nodoLines.map((line) => renderWindowLine(line, innerWidth, blue)),
    renderWindowLine('', innerWidth),
    renderWindowLine(footerText, innerWidth),
    `└${'─'.repeat(innerWidth + 2)}┘`,
  ].join('\n');
}

function isPathInside(parentPath, childPath) {
  const relative = path.relative(parentPath, childPath);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function shouldPrintInstallMessage() {
  if (process.env.STACKNODO_FORCE_POSTINSTALL_MESSAGE === '1') return true;
  if (process.env.CI) return false;

  if (packageRoot.includes(`${path.sep}node_modules${path.sep}`)) {
    return true;
  }

  const initCwd = process.env.INIT_CWD ? path.resolve(process.env.INIT_CWD) : null;

  // Skip the message only when installing inside the SDK repository itself.
  if (initCwd && isPathInside(packageRoot, initCwd)) {
    return false;
  }

  return true;
}

if (shouldPrintInstallMessage()) {
  console.log(''); console.log('');
  console.log(renderPostinstallGraphic());
  console.log('');
  console.log('Stacknodo SDK installed.');
  console.log('');
  console.log('Recommended next step for Cursor, Windsurf, GitHub Copilot, and similar AI coding agents:');
  console.log('');
  console.log(agentInstallCommandBox);
  console.log('');
  console.log('Get started and read the production docs:');
  console.log('');
  console.log(`  SDK: ${sdkDocsLink}`);
  console.log('');
  console.log('AI Coding Agent Integration:');
  console.log('');
  console.log(`  Guide: ${agentDocsLink}`);
  console.log('');
}