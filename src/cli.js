#!/usr/bin/env node

import { cpSync, existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { commandBox, terminalLink } from './terminal-links.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const packageRoot = path.resolve(__dirname, '..');
const cwd = process.cwd();
const sdkDocsUrl = 'https://docs.stacknodo.com/#sdk';
const agentDocsUrl = 'https://docs.stacknodo.com/#agent-skills';
const agentInstallCommand = 'npx stacknodo agent install';

function printUsage() {
  const sdkDocsLink = terminalLink('Open SDK docs ↗', sdkDocsUrl, { fallback: sdkDocsUrl });
  const agentDocsLink = terminalLink('AI Coding Agent guide ↗', agentDocsUrl, { fallback: agentDocsUrl });
  const agentInstallCommandBox = commandBox(agentInstallCommand);

  console.log(`Stacknodo CLI

Recommended after npm install:
${agentInstallCommandBox}

Usage:
  stacknodo agent install [--force] [--dest <path>]
  stacknodo agent path
  stacknodo --help

Commands:
  agent install   Copy bundled Stacknodo agent skills into your project root
  agent path      Print the bundled skills source path inside the installed package

Options:
  --force         Overwrite an existing installed skill directory
  --dest <path>   Destination root for the .agents directory (default: current working directory)

Guides:
  SDK:            ${sdkDocsLink}
  Coding Agents:  ${agentDocsLink}
`);
}

function fail(message, exitCode = 1) {
  console.error(message);
  process.exit(exitCode);
}

function parseOption(args, name) {
  const index = args.indexOf(name);
  if (index === -1) return null;
  const value = args[index + 1];
  if (!value || value.startsWith('--')) fail(`Missing value for ${name}`);
  return value;
}

function installAgentSkills(args) {
  const sourceDir = path.join(packageRoot, '.agents', 'skills', 'stacknodo-sdk');
  if (!existsSync(sourceDir)) {
    fail(`Bundled agent skills not found at ${sourceDir}`);
  }

  const destinationRoot = parseOption(args, '--dest')
    ? path.resolve(cwd, parseOption(args, '--dest'))
    : cwd;
  const destinationDir = path.join(destinationRoot, '.agents', 'skills', 'stacknodo-sdk');
  const force = args.includes('--force');

  if (existsSync(destinationDir) && !force) {
    fail(
      `Agent skills already exist at ${destinationDir}. Re-run with --force to overwrite.`
    );
  }

  mkdirSync(path.dirname(destinationDir), { recursive: true });
  cpSync(sourceDir, destinationDir, {
    recursive: true,
    force,
    errorOnExist: !force,
  });

  console.log(`Installed Stacknodo agent skills to ${destinationDir}`);
  console.log('Compatible coding agents can now read the project-root .agents directory.');
}

function printAgentPath() {
  const sourceDir = path.join(packageRoot, '.agents', 'skills', 'stacknodo-sdk');
  console.log(sourceDir);
}

const args = process.argv.slice(2);

if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
  printUsage();
  process.exit(0);
}

if (args[0] === 'agent' && args[1] === 'install') {
  installAgentSkills(args.slice(2));
  process.exit(0);
}

if (args[0] === 'agent' && args[1] === 'path') {
  printAgentPath();
  process.exit(0);
}

fail(`Unknown command: ${args.join(' ')}`);