import { app, BrowserWindow, Menu, screen, shell } from 'electron';
import * as path from 'path';
import log from 'electron-log';
import { setMainWindow, getMainWindow, setWebBroadcast, broadcastToWeb, sendToRenderer } from './broadcast';
import { registerAllHandlers, getApiHandlers, setAutoUpdater, SETTING_DEFAULTS } from './ipc';
import { killAllSessions, warmupPty, handleWebSocketMessage, activeSessions } from './pty/manager';
import { startProjectsWatcher, stopProjectsWatcher } from './cache/watcher';
import { shutdownAll as shutdownAllMcp, cleanStaleLockFiles } from './mcp/server';
import { getSetting, setSetting, closeDb } from './db';

// TODO: import from @shared/types when available
interface WebServer {
  server: import('http').Server;
  broadcast: (msg: { type: string; args: unknown[] }) => void;
  stop: () => Promise<void>;
}

log.transports.file.level = app.isPackaged ? 'info' : 'debug';
log.transports.console.level = app.isPackaged ? 'info' : 'debug';

try { require('electron-reloader')(module, { watchRenderer: true }); } catch { /* dev only */ }

// ── Auto-updater (only in packaged builds) ────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let autoUpdater: any = null;
if (app.isPackaged || process.env.FORCE_UPDATER) {
  autoUpdater = require('electron-updater').autoUpdater;
  autoUpdater.logger = log;
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  if (!app.isPackaged) autoUpdater.forceDevUpdateConfig = true;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function sendUpdaterEvent(type: string, data?: any): void {
    log.info(`[updater] ${type}`, data || '');
    const mainWindow = getMainWindow();
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('updater-event', type, data);
    }
    broadcastToWeb('updater-event', type, data);
  }

  autoUpdater.on('checking-for-update', () => sendUpdaterEvent('checking'));
  autoUpdater.on('update-available', (info: unknown) => sendUpdaterEvent('update-available', info));
  autoUpdater.on('update-not-available', (info: unknown) => sendUpdaterEvent('update-not-available', info));
  autoUpdater.on('download-progress', (progress: unknown) => sendUpdaterEvent('download-progress', progress));
  autoUpdater.on('update-downloaded', (info: unknown) => sendUpdaterEvent('update-downloaded', info));
  autoUpdater.on('error', (err: Error | null) => {
    log.error('[updater] Error:', err?.message || String(err));
    const mainWindow = getMainWindow();
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('updater-event', 'error', { message: err?.message || String(err) });
    }
    broadcastToWeb('updater-event', 'error', { message: err?.message || String(err) });
  });
}

// Inject auto-updater into the IPC handler
setAutoUpdater(autoUpdater);

// ── Window creation ───────────────────────────────────────────────

function createWindow(): void {
  const savedBounds = getSetting('global')?.windowBounds;
  let bounds = { width: 1400, height: 900 };

  let restorePosition: { x: number; y: number } | null = null;
  if (savedBounds && savedBounds.width && savedBounds.height) {
    bounds.width = savedBounds.width;
    bounds.height = savedBounds.height;

    if (savedBounds.x != null && savedBounds.y != null) {
      const displays = screen.getAllDisplays();
      const onScreen = displays.some(d => {
        const b = d.bounds;
        return savedBounds.x >= b.x - 100 && savedBounds.x < b.x + b.width &&
               savedBounds.y >= b.y - 100 && savedBounds.y < b.y + b.height;
      });
      if (onScreen) {
        restorePosition = { x: savedBounds.x, y: savedBounds.y };
      }
    }
  }

  const mainWindow = new BrowserWindow({
    ...bounds,
    minWidth: 800,
    minHeight: 500,
    title: 'Switchboard',
    icon: path.join(__dirname, '..','build', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  if (restorePosition) {
    mainWindow.setBounds({ ...restorePosition, width: bounds.width, height: bounds.height });
  }

  mainWindow.loadFile(path.join(__dirname, '..','public', 'index.html'));

  // Open external links in the system browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) shell.openExternal(url).catch(() => {});
    return { action: 'deny' };
  });
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (url !== mainWindow.webContents.getURL()) {
      event.preventDefault();
      if (/^https?:\/\//i.test(url)) shell.openExternal(url).catch(() => {});
    }
  });

  // Override window.open so xterm WebLinksAddon's default handler routes through IPC
  mainWindow.webContents.on('did-finish-load', () => {
    mainWindow.webContents.executeJavaScript(`
      window.open = function(url) {
        if (url && /^https?:\\/\\//i.test(url)) { window.api.openExternal(url); return null; }
        const proxy = {};
        Object.defineProperty(proxy, 'location', { get() {
          const loc = {};
          Object.defineProperty(loc, 'href', {
            set(u) { if (/^https?:\\/\\//i.test(u)) window.api.openExternal(u); }
          });
          return loc;
        }});
        return proxy;
      };
      void 0;
    `);
  });

  // Prevent Cmd+R / Ctrl+Shift+R from reloading
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return;
    const key = input.key.toLowerCase();
    if (key === 'r' && input.meta) event.preventDefault();
    if (key === 'r' && input.control && input.shift) event.preventDefault();
  });

  // Save window bounds on move/resize (debounced)
  let boundsTimer: ReturnType<typeof setTimeout> | null = null;
  const saveBounds = (): void => {
    if (boundsTimer) clearTimeout(boundsTimer);
    boundsTimer = setTimeout(() => {
      if (!mainWindow || mainWindow.isDestroyed() || mainWindow.isMinimized()) return;
      const b = mainWindow.getBounds();
      const global = getSetting('global') || {};
      global.windowBounds = { x: b.x, y: b.y, width: b.width, height: b.height };
      setSetting('global', global);
    }, 500);
  };
  mainWindow.on('resize', saveBounds);
  mainWindow.on('move', saveBounds);

  mainWindow.on('close', () => {
    if (boundsTimer) clearTimeout(boundsTimer);
    if (!mainWindow.isMinimized()) {
      const b = mainWindow.getBounds();
      const global = getSetting('global') || {};
      global.windowBounds = { x: b.x, y: b.y, width: b.width, height: b.height };
      setSetting('global', global);
    }
  });

  mainWindow.on('closed', () => {
    killAllSessions();
    setMainWindow(null);
  });

  setMainWindow(mainWindow);
}

// ── App menu ──────────────────────────────────────────────────────

function buildMenu(): void {
  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: app.name,
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
      ],
    },
    {
      label: 'View',
      submenu: [
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// ── App lifecycle ─────────────────────────────────────────────────

let webServer: WebServer | null = null;

app.whenReady().then(() => {
  buildMenu();
  registerAllHandlers();
  cleanStaleLockFiles(log);
  createWindow();
  startProjectsWatcher();

  // Start web server if enabled
  const globalSettings = getSetting('global') || {};
  const webEnabled = globalSettings.webServerEnabled !== undefined
    ? globalSettings.webServerEnabled
    : SETTING_DEFAULTS.webServerEnabled;
  const webPort = (globalSettings.webServerPort || SETTING_DEFAULTS.webServerPort) as number;

  if (webEnabled) {
    try {
      // TODO: import from @web when web-server migration is complete
      const { createWebServer } = require('../../web-server') as {
        createWebServer: (opts: Record<string, unknown>) => WebServer;
      };

      webServer = createWebServer({
        port: webPort,
        host: '0.0.0.0',
        publicDir: path.join(__dirname, '..','public'),
        nodeModulesDir: path.join(__dirname, '..','node_modules'),
        handlers: getApiHandlers(),
        onWsMessage: handleWebSocketMessage,
        log,
      });
      setWebBroadcast(webServer.broadcast);

      webServer.server.on('listening', () => {
        log.info(`[web] Access Switchboard at http://localhost:${webPort}`);
        sendToRenderer('status-update', `Web UI available at http://localhost:${webPort}`, 'info');
      });

      webServer.server.on('error', (err: NodeJS.ErrnoException) => {
        if (err.code === 'EADDRINUSE') {
          log.error(`[web] Port ${webPort} is already in use`);
          sendToRenderer('status-update', `Web server port ${webPort} is already in use. Change the port in Global Settings.`, 'error');
        } else {
          log.error(`[web] Server error: ${err.message}`);
        }
        webServer = null;
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      log.error(`[web] Failed to start: ${message}`);
      webServer = null;
    }
  }

  // Warm up node-pty
  setTimeout(warmupPty, 500);

  // Check for updates after launch
  if (autoUpdater) {
    setTimeout(() => autoUpdater.checkForUpdates().catch((e: Error) => log.error('[updater] check failed:', e?.message || String(e))), 5000);
    setInterval(() => autoUpdater.checkForUpdates().catch((e: Error) => log.error('[updater] check failed:', e?.message || String(e))), 4 * 60 * 60 * 1000);
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  if (webServer) {
    webServer.stop().catch(() => {});
    webServer = null;
  }

  shutdownAllMcp();
  stopProjectsWatcher();

  for (const [, session] of activeSessions) {
    if (!session.exited) {
      try { session.pty.kill(); } catch { /* ignore */ }
    }
  }
});

app.on('will-quit', () => {
  closeDb();
});
