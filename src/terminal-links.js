const OSC = '\u001B]8;;';
const BEL = '\u0007';
const BLUE = '\u001B[94m';
const GREEN = '\u001B[92m';
const RED = '\u001B[91m';
const YELLOW = '\u001B[93m';
const RESET = '\u001B[39m';

export function supportsTerminalColors(stream = process.stdout) {
  if (process.env.NO_COLOR) return false;
  if (process.env.FORCE_COLOR === '0') return false;
  if (process.env.FORCE_COLOR && process.env.FORCE_COLOR !== '0') return true;
  if (!stream?.isTTY) return false;
  if (process.env.TERM === 'dumb') return false;

  return true;
}

export function blue(text, { stream = process.stdout } = {}) {
  if (!supportsTerminalColors(stream)) return text;
  return `${BLUE}${text}${RESET}`;
}

export function green(text, { stream = process.stdout } = {}) {
  if (!supportsTerminalColors(stream)) return text;
  return `${GREEN}${text}${RESET}`;
}

export function red(text, { stream = process.stdout } = {}) {
  if (!supportsTerminalColors(stream)) return text;
  return `${RED}${text}${RESET}`;
}

export function yellow(text, { stream = process.stdout } = {}) {
  if (!supportsTerminalColors(stream)) return text;
  return `${YELLOW}${text}${RESET}`;
}

export function commandBox(command, { stream = process.stdout } = {}) {
  const horizontal = '\u2500'.repeat(command.length + 2);
  const lines = [
    `\u250C${horizontal}\u2510`,
    `\u2502 ${command} \u2502`,
    `\u2514${horizontal}\u2518`,
  ];

  return green(lines.join('\n'), { stream });
}

export function supportsTerminalLinks(stream = process.stdout) {
  if (process.env.STACKNODO_FORCE_TERMINAL_LINKS === '1') return true;
  if (process.env.STACKNODO_DISABLE_TERMINAL_LINKS === '1') return false;
  if (!stream?.isTTY) return false;
  if (process.env.TERM === 'dumb') return false;

  const termProgram = process.env.TERM_PROGRAM;
  if (termProgram === 'iTerm.app' || termProgram === 'WezTerm' || termProgram === 'vscode') {
    return true;
  }

  if (process.env.VTE_VERSION) return true;
  if (process.env.KITTY_WINDOW_ID) return true;
  if (process.env.WT_SESSION) return true;
  if (process.env.KONSOLE_VERSION) return true;

  return false;
}

export function terminalLink(label, url, {
  stream = process.stdout,
  fallback = url,
} = {}) {
  if (!supportsTerminalLinks(stream)) return blue(fallback, { stream });
  return blue(`${OSC}${url}${BEL}${label}${OSC}${BEL}`, { stream });
}