#!/usr/bin/env node

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { commandBox, green, rgb, terminalLink } from './terminal-links.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const packageRoot = path.resolve(__dirname, '..');

const sdkDocsUrl = 'https://docs.stacknodo.com/#sdk';
const agentDocsUrl = 'https://docs.stacknodo.com/#agent-skills';
const agentInstallCommand = 'npx stacknodo agent install';

const sdkDocsLink = terminalLink('Open SDK docs ↗', sdkDocsUrl, { fallback: sdkDocsUrl });
const agentDocsLink = terminalLink('AI Coding Agent guide ↗', agentDocsUrl, { fallback: agentDocsUrl });
const agentInstallCommandBox = commandBox(agentInstallCommand);

// "ANSI Shadow" figlet style glyphs. Solid blocks (█) form the letter face;
// the box-drawing characters (╗ ╝ ╔ ╚ ═ ║) form the built-in 3D shadow.
const BLOCK_FONT = {
  A: [
    ' █████╗ ',
    '██╔══██╗',
    '███████║',
    '██╔══██║',
    '██║  ██║',
    '╚═╝  ╚═╝',
  ],
  C: [
    ' ██████╗',
    '██╔════╝',
    '██║     ',
    '██║     ',
    '╚██████╗',
    ' ╚═════╝',
  ],
  D: [
    '██████╗ ',
    '██╔══██╗',
    '██║  ██║',
    '██║  ██║',
    '██████╔╝',
    '╚═════╝ ',
  ],
  K: [
    '██╗  ██╗',
    '██║ ██╔╝',
    '█████╔╝ ',
    '██╔═██╗ ',
    '██║  ██╗',
    '╚═╝  ╚═╝',
  ],
  N: [
    '███╗   ██╗',
    '████╗  ██║',
    '██╔██╗ ██║',
    '██║╚██╗██║',
    '██║ ╚████║',
    '╚═╝  ╚═══╝',
  ],
  O: [
    ' ██████╗ ',
    '██╔═══██╗',
    '██║   ██║',
    '██║   ██║',
    '╚██████╔╝',
    ' ╚═════╝ ',
  ],
  S: [
    '███████╗',
    '██╔════╝',
    '███████╗',
    '╚════██║',
    '███████║',
    '╚══════╝',
  ],
  T: [
    '████████╗',
    '╚══██╔══╝',
    '   ██║   ',
    '   ██║   ',
    '   ██║   ',
    '   ╚═╝   ',
  ],
};

const GLYPH_HEIGHT = 6;
const SHADOW_CHARS = new Set(['╗', '╝', '╔', '╚', '═', '║']);

/**
 * Render a word in the ANSI Shadow style. Returns an array of plain row
 * strings (no ANSI codes). Coloring is applied later, once we know each row's
 * position in the whole graphic, so the diagonal shine can sweep across both
 * words continuously.
 */
function renderBlockWord(word) {
  const rows = Array.from({ length: GLYPH_HEIGHT }, () => '');

  word.toUpperCase().split('').forEach((char, charIndex) => {
    const glyph = BLOCK_FONT[char];
    if (!glyph) throw new Error(`Missing block font glyph for ${char}`);

    const glyphWidth = Math.max(...glyph.map((line) => [...line].length));
    glyph.forEach((segment, rowIndex) => {
      if (charIndex > 0) rows[rowIndex] += ' ';
      rows[rowIndex] += segment.padEnd(glyphWidth, ' ');
    });
  });

  return rows;
}

// Green palette (24-bit). Base = original Stacknodo brand emerald, shine = the
// lighter highlight that the diagonal light band fades toward.
const FACE_BASE = [16, 185, 129];
const FACE_SHINE = [180, 255, 214];
const SHADOW_BASE = [8, 92, 64];
const SHADOW_SHINE = [60, 170, 120];

const SHINE_SLOPE = -3;      // columns the band center shifts per row (negative = opposite diagonal)
const SHINE_HALF_WIDTH = 10; // half-thickness of the light band

function lerp(a, b, t) {
  return Math.round(a + (b - a) * t);
}

function mix(base, shine, t) {
  return [lerp(base[0], shine[0], t), lerp(base[1], shine[1], t), lerp(base[2], shine[2], t)];
}

/**
 * Colorize one art line. `col` is the absolute column within the centered art
 * block; `globalRow` is the row index across the whole graphic. The diagonal
 * shine peaks where the column sits on the moving band center.
 */
function colorizeArtLine(plain, globalRow, totalRows, innerWidth) {
  const bandCenter = innerWidth / 2 + (globalRow - (totalRows - 1) / 2) * SHINE_SLOPE;
  let out = '';

  for (let col = 0; col < plain.length; col += 1) {
    const char = plain[col];
    if (char !== '█' && !SHADOW_CHARS.has(char)) {
      out += char;
      continue;
    }

    const distance = Math.abs(col - bandCenter);
    const t = Math.max(0, 1 - distance / SHINE_HALF_WIDTH);
    const eased = t * t * (3 - 2 * t); // smoothstep for a soft glow
    const [r, g, b] = char === '█'
      ? mix(FACE_BASE, FACE_SHINE, eased)
      : mix(SHADOW_BASE, SHADOW_SHINE, eased);
    out += rgb(char, r, g, b);
  }

  return out;
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

/**
 * Pad+center a plain art row to `width`, then colorize it with the diagonal
 * shine using its absolute column positions.
 */
function renderArtLine(plain, globalRow, totalRows, width) {
  const totalPadding = Math.max(0, width - plain.length);
  const leftPadding = Math.floor(totalPadding / 2);
  const rightPadding = totalPadding - leftPadding;
  const padded = `${' '.repeat(leftPadding)}${plain}${' '.repeat(rightPadding)}`;
  return `│ ${colorizeArtLine(padded, globalRow, totalRows, width)} │`;
}

function renderPostinstallGraphic() {
  const titleText = '⟡  Welcome to Stacknodo SDK';
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

  // One blank row sits between the two words; the shine treats the whole block
  // (STACK + gap + NODO) as a single continuous canvas.
  const totalArtRows = stackLines.length + 1 + nodoLines.length;
  const stackArt = stackLines.map((line, i) => renderArtLine(line, i, totalArtRows, innerWidth));
  const gapRow = stackLines.length;
  const nodoArt = nodoLines.map((line, i) => renderArtLine(line, gapRow + 1 + i, totalArtRows, innerWidth));

  return [
    `╭${'─'.repeat(innerWidth + 2)}╮`,
    `│ ${green('⟡')}  Welcome to ${green('Stacknodo SDK')}${titlePadding} │`,
    `├${'─'.repeat(innerWidth + 2)}┤`,
    renderWindowLine('', innerWidth),
    ...stackArt,
    renderWindowLine('', innerWidth),
    ...nodoArt,
    renderWindowLine('', innerWidth),
    renderWindowLine(footerText, innerWidth),
    `╰${'─'.repeat(innerWidth + 2)}╯`,
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