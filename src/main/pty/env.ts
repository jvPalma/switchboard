/**
 * Clean environment for child PTY processes.
 * Strips Electron internals that cause nested Electron apps
 * (or node-pty inside them) to malfunction.
 */
export const cleanPtyEnv: Record<string, string | undefined> = Object.fromEntries(
  Object.entries(process.env).filter(([k]) =>
    !k.startsWith('ELECTRON_') &&
    !k.startsWith('GOOGLE_API_KEY') &&
    k !== 'NODE_OPTIONS' &&
    k !== 'ORIGINAL_XDG_CURRENT_DESKTOP'
  )
);

/** Standard terminal environment variables added to every PTY spawn */
export const TERMINAL_ENV = {
  TERM: 'xterm-256color',
  COLORTERM: 'truecolor',
  TERM_PROGRAM: 'iTerm.app',
  FORCE_COLOR: '3',
  ITERM_SESSION_ID: '1',
} as const;
