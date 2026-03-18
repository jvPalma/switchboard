import http from 'http';
import path from 'path';
import express from 'express';
import { WebSocketServer, WebSocket } from 'ws';

// TODO: Import from @shared/types/ once created
export interface Logger {
  info: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
  debug: (...args: unknown[]) => void;
}

export type HandlerFn = (...args: unknown[]) => unknown | Promise<unknown>;
export type HandlerRegistry = Record<string, HandlerFn>;

export interface WebServerOptions {
  port?: number;
  host?: string;
  publicDir: string;
  nodeModulesDir: string;
  log: Logger;
  handlers?: HandlerRegistry;
  onWsMessage?: ((msg: Record<string, unknown>) => void) | null;
}

export interface WebServerInstance {
  server: http.Server;
  wss: WebSocketServer;
  broadcast: (message: unknown) => void;
  stop: () => Promise<void>;
  clients: Set<WebSocket>;
}

const WEB_UNSUPPORTED = new Set([
  'browse-folder',
  'open-external',
  'updater-check',
  'updater-download',
  'updater-install',
]);

export const createWebServer = ({
  port = 8081,
  host = '0.0.0.0',
  publicDir,
  nodeModulesDir,
  log,
  handlers = {},
  onWsMessage = null,
}: WebServerOptions): WebServerInstance => {
  // -- Express app & static files -------------------------------------------
  const app = express();

  app.use(express.json());

  // Serve node_modules assets that index.html references via ../node_modules/ paths.
  // Only expose the specific packages needed (xterm, addons, morphdom).
  app.use('/node_modules/@xterm', express.static(path.join(nodeModulesDir, '@xterm')));
  app.use('/node_modules/morphdom', express.static(path.join(nodeModulesDir, 'morphdom')));

  app.use(express.static(publicDir));

  // -- REST API routes (mirrors IPC handlers) -------------------------------
  for (const [channel, handler] of Object.entries(handlers)) {
    app.post(`/api/${channel}`, async (req, res) => {
      if (WEB_UNSUPPORTED.has(channel)) {
        return res.status(400).json({
          error: `'${channel}' is not available in web mode`,
        });
      }
      try {
        const args = (req.body as { args?: unknown[] }).args || [];
        const result = await handler(...args);
        res.json({ result: result ?? null });
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        log.error(`[web] REST /api/${channel} error: ${message}`);
        res.status(500).json({ error: message });
      }
    });
  }

  // -- HTTP server ----------------------------------------------------------
  const server = http.createServer(app);

  // -- WebSocket (noServer mode) --------------------------------------------
  const clients = new Set<WebSocket>();
  const wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', (req: http.IncomingMessage, socket: import('stream').Duplex, head: Buffer) => {
    if (req.url !== '/ws') {
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit('connection', ws, req);
    });
  });

  wss.on('connection', (ws: WebSocket) => {
    clients.add(ws);
    log.info('[web] WebSocket client connected');

    ws.on('message', (data: Buffer | string) => {
      let msg: Record<string, unknown>;
      try {
        msg = JSON.parse(data.toString()) as Record<string, unknown>;
      } catch {
        log.warn('[web] Received invalid JSON from WebSocket client');
        return;
      }
      if (onWsMessage) {
        onWsMessage(msg);
      } else {
        log.debug(`[web] Unhandled WS message type: ${String(msg.type)}`);
      }
    });

    ws.on('close', () => {
      clients.delete(ws);
      log.debug('[web] WebSocket client disconnected');
    });

    ws.on('error', (err: Error) => {
      clients.delete(ws);
      log.error(`[web] WebSocket error: ${err.message}`);
    });
  });

  // -- Helpers --------------------------------------------------------------
  const broadcast = (message: unknown): void => {
    const payload = JSON.stringify(message);
    for (const ws of clients) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(payload);
      }
    }
  };

  const stop = (): Promise<void> => {
    return new Promise((resolve) => {
      wss.close(() => {
        server.close(() => resolve());
      });
    });
  };

  // -- Start listening ------------------------------------------------------
  server.listen(port, host, () => {
    log.info(`[web] Server listening on http://${host}:${port}`);
  });

  return { server, wss, broadcast, stop, clients };
};
