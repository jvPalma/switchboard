import { BrowserWindow } from 'electron';
import log from 'electron-log';

let mainWindow: BrowserWindow | null = null;
let webBroadcastFn: (msg: { type: string; args: unknown[] }) => void = () => {};

export const getMainWindow = (): BrowserWindow | null => mainWindow;

export const setMainWindow = (win: BrowserWindow | null): void => {
  mainWindow = win;
};

export const setWebBroadcast = (fn: (msg: { type: string; args: unknown[] }) => void): void => {
  webBroadcastFn = fn;
};

export const broadcastToWeb = (type: string, ...args: unknown[]): void => {
  webBroadcastFn({ type, args });
};

export const sendToRenderer = (channel: string, ...args: unknown[]): void => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, ...args);
  }
  broadcastToWeb(channel, ...args);
};

export const sendStatus = (text: string, type?: string): void => {
  if (text) log.info(`[status] (${type || 'info'}) ${text}`);
  sendToRenderer('status-update', text, type || 'info');
};

export const notifyRendererProjectsChanged = (): void => {
  sendToRenderer('projects-changed');
};

/**
 * Proxy object the MCP bridge uses instead of the real BrowserWindow.
 * Sends events to both the Electron renderer and web clients.
 */
export const createMcpWindowProxy = (): McpWindowProxy => ({
  isDestroyed: () => !mainWindow || mainWindow.isDestroyed(),
  webContents: {
    send(channel: string, ...args: unknown[]) {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send(channel, ...args);
      }
      broadcastToWeb(channel, ...args);
    },
  },
});

// TODO: import from @shared/types when available
export interface McpWindowProxy {
  isDestroyed(): boolean;
  webContents: {
    send(channel: string, ...args: unknown[]): void;
  };
}
