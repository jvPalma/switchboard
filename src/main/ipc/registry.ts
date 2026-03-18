import { ipcMain } from 'electron';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ApiHandler = (...args: any[]) => any;

const apiHandlers: Record<string, ApiHandler> = {};

/**
 * Register a handler for both Electron IPC (ipcMain.handle) and
 * the web server REST API (stored in apiHandlers map).
 */
export const registerHandler = (channel: string, fn: ApiHandler): void => {
  apiHandlers[channel] = fn;
  ipcMain.handle(channel, (_event, ...args) => fn(...args));
};

/** Get the full handler registry for passing to the web server */
export const getApiHandlers = (): Record<string, ApiHandler> => apiHandlers;
