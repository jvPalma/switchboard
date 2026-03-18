import { ipcMain } from 'electron';
import { registerHandler } from './registry';
import {
  spawnTerminal, killSession,
  getActiveSessions, getActiveTerminals,
  handleTerminalInput, handleTerminalResize, handleCloseTerminal,
} from '@main/pty/manager';
import type { SessionOptions } from '@main/pty/manager';

export function register(): void {
  registerHandler('open-terminal', async (
    sessionId: string,
    projectPath: string,
    isNew: boolean,
    sessionOptions?: SessionOptions,
  ) => {
    return spawnTerminal(sessionId, projectPath, isNew, sessionOptions);
  });

  registerHandler('stop-session', (sessionId: string) => {
    return killSession(sessionId);
  });

  registerHandler('get-active-sessions', () => {
    return getActiveSessions();
  });

  registerHandler('get-active-terminals', () => {
    return getActiveTerminals();
  });

  // Fire-and-forget handlers (ipcMain.on, not handle)
  ipcMain.on('terminal-input', (_event, sessionId: string, data: string) => {
    handleTerminalInput(sessionId, data);
  });

  ipcMain.on('terminal-resize', (_event, sessionId: string, cols: number, rows: number) => {
    handleTerminalResize(sessionId, cols, rows);
  });

  ipcMain.on('close-terminal', (_event, sessionId: string) => {
    handleCloseTerminal(sessionId);
  });
}
