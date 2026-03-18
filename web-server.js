/**
 * web-server.js — Express + WebSocket server factory for Switchboard.
 *
 * Creates an HTTP server that serves the renderer UI and exposes a
 * WebSocket endpoint at /ws for real-time communication with browser
 * clients.
 */

const http = require('http');
const path = require('path');
const express = require('express');
const { WebSocketServer } = require('ws');

/**
 * Create and start the web server.
 * @param {object} options
 * @param {number}  [options.port=8081]         - Port to listen on.
 * @param {string}  [options.host='0.0.0.0']    - Host/interface to bind.
 * @param {string}  options.publicDir            - Absolute path to the static public directory.
 * @param {string}  options.nodeModulesDir       - Absolute path to node_modules.
 * @param {object}  options.log                  - Logger (electron-log compatible).
 * @param {Object<string, (...args: any[]) => Promise<any>>} [options.handlers={}] - API handler registry (channel -> handler).
 * @param {function} [options.onWsMessage] - Callback for incoming WebSocket messages: (msg: object) => void
 * @returns {{ server: http.Server, wss: WebSocketServer, broadcast: (msg: object) => void, stop: () => Promise<void>, clients: Set<import('ws')> }}
 */
function createWebServer({ port = 8081, host = '0.0.0.0', publicDir, nodeModulesDir, log, handlers = {}, onWsMessage = null }) {

  // -- Express app & static files ---------------------------------------------
  const app = express();

  app.use(express.json());

  // Serve node_modules assets that index.html references via ../node_modules/ paths.
  // Only expose the specific packages needed (xterm, addons, morphdom).
  app.use('/node_modules/@xterm', express.static(path.join(nodeModulesDir, '@xterm')));
  app.use('/node_modules/morphdom', express.static(path.join(nodeModulesDir, 'morphdom')));

  app.use(express.static(publicDir));

  // -- REST API routes (mirrors IPC handlers) ---------------------------------
  const WEB_UNSUPPORTED = new Set([
    'browse-folder',
    'open-external',
    'updater-check',
    'updater-download',
    'updater-install',
  ]);

  for (const [channel, handler] of Object.entries(handlers)) {
    app.post(`/api/${channel}`, async (req, res) => {
      if (WEB_UNSUPPORTED.has(channel)) {
        return res.status(400).json({
          error: `'${channel}' is not available in web mode`,
        });
      }
      try {
        const args = req.body.args || [];
        const result = await handler(...args);
        res.json({ result: result ?? null });
      } catch (err) {
        log.error(`[web] REST /api/${channel} error: ${err.message}`);
        res.status(500).json({ error: err.message });
      }
    });
  }

  // -- HTTP server ------------------------------------------------------------
  const server = http.createServer(app);

  // -- WebSocket (noServer mode) ----------------------------------------------
  const clients = new Set();
  const wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', (req, socket, head) => {
    if (req.url !== '/ws') {
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit('connection', ws, req);
    });
  });

  wss.on('connection', (ws) => {
    clients.add(ws);
    log.info('[web] WebSocket client connected');

    ws.on('message', (data) => {
      let msg;
      try {
        msg = JSON.parse(data.toString());
      } catch {
        log.warn('[web] Received invalid JSON from WebSocket client');
        return;
      }
      if (onWsMessage) {
        onWsMessage(msg);
      } else {
        log.debug(`[web] Unhandled WS message type: ${msg.type}`);
      }
    });

    ws.on('close', () => {
      clients.delete(ws);
      log.debug('[web] WebSocket client disconnected');
    });

    ws.on('error', (err) => {
      clients.delete(ws);
      log.error(`[web] WebSocket error: ${err.message}`);
    });
  });

  // -- Helpers ----------------------------------------------------------------

  function broadcast(message) {
    const payload = JSON.stringify(message);
    for (const ws of clients) {
      if (ws.readyState === 1) {
        ws.send(payload);
      }
    }
  }

  function stop() {
    return new Promise((resolve) => {
      wss.close(() => {
        server.close(() => resolve());
      });
    });
  }

  // -- Start listening --------------------------------------------------------
  server.listen(port, host, () => {
    log.info(`[web] Server listening on http://${host}:${port}`);
  });

  return { server, wss, broadcast, stop, clients };
}

module.exports = { createWebServer };
