const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { createWebServer } = require('../web-server');
const WebSocket = require('ws');

const mockLog = { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} };

test('REST API routes call handlers and return JSON results', async () => {
  const publicDir = fs.mkdtempSync(path.join(os.tmpdir(), 'switchboard-web-test-'));
  const nodeModulesDir = path.join(__dirname, '..', 'node_modules');

  const handlers = {
    'get-projects': (showArchived) => [{ id: 1, name: 'test', archived: showArchived }],
    'search': (type, query) => [{ id: 'abc', snippet: query }],
  };

  const { server, stop } = createWebServer({
    port: 0,
    publicDir,
    nodeModulesDir,
    log: mockLog,
    handlers,
  });

  try {
    await new Promise((resolve) => server.once('listening', resolve));
    const port = server.address().port;

    const projectsRes = await fetch(`http://127.0.0.1:${port}/api/get-projects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ args: [false] }),
    });
    assert.equal(projectsRes.status, 200);
    const projectsBody = await projectsRes.json();
    assert.deepStrictEqual(projectsBody, { result: [{ id: 1, name: 'test', archived: false }] });

    const searchRes = await fetch(`http://127.0.0.1:${port}/api/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ args: ['session', 'hello'] }),
    });
    assert.equal(searchRes.status, 200);
    const searchBody = await searchRes.json();
    assert.deepStrictEqual(searchBody, { result: [{ id: 'abc', snippet: 'hello' }] });
  } finally {
    await stop();
    fs.rmSync(publicDir, { recursive: true, force: true });
  }
});

test('web-unsupported routes return 400 error', async () => {
  const publicDir = fs.mkdtempSync(path.join(os.tmpdir(), 'switchboard-web-test-'));
  const nodeModulesDir = path.join(__dirname, '..', 'node_modules');

  const handlers = {
    'browse-folder': () => '/some/path',
  };

  const { server, stop } = createWebServer({
    port: 0,
    publicDir,
    nodeModulesDir,
    log: mockLog,
    handlers,
  });

  try {
    await new Promise((resolve) => server.once('listening', resolve));
    const port = server.address().port;

    const res = await fetch(`http://127.0.0.1:${port}/api/browse-folder`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ args: [] }),
    });
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.match(body.error, /not available in web mode/);
  } finally {
    await stop();
    fs.rmSync(publicDir, { recursive: true, force: true });
  }
});

test('WebSocket broadcast delivers messages to clients', async () => {
  const publicDir = fs.mkdtempSync(path.join(os.tmpdir(), 'switchboard-web-test-'));
  const nodeModulesDir = path.join(__dirname, '..', 'node_modules');

  const { server, broadcast, stop } = createWebServer({
    port: 0,
    publicDir,
    nodeModulesDir,
    log: mockLog,
  });

  let client;
  try {
    await new Promise((resolve) => server.once('listening', resolve));
    const port = server.address().port;

    client = new WebSocket(`ws://127.0.0.1:${port}/ws`);
    await new Promise((resolve) => client.on('open', resolve));

    const received = new Promise((resolve) => {
      client.on('message', (data) => resolve(JSON.parse(data.toString())));
    });

    broadcast({ type: 'terminal-data', args: ['session1', 'hello'] });

    const msg = await received;
    assert.deepStrictEqual(msg, { type: 'terminal-data', args: ['session1', 'hello'] });
  } finally {
    if (client && client.readyState === WebSocket.OPEN) {
      client.close();
    }
    await stop();
    fs.rmSync(publicDir, { recursive: true, force: true });
  }
});

test('WebSocket onWsMessage dispatches incoming messages', async () => {
  const publicDir = fs.mkdtempSync(path.join(os.tmpdir(), 'switchboard-web-test-'));
  const nodeModulesDir = path.join(__dirname, '..', 'node_modules');

  const received = [];
  const { server, stop } = createWebServer({
    port: 0,
    publicDir,
    nodeModulesDir,
    log: mockLog,
    onWsMessage: (msg) => received.push(msg),
  });

  let client;
  try {
    await new Promise((resolve) => server.once('listening', resolve));
    const port = server.address().port;

    client = new WebSocket(`ws://127.0.0.1:${port}/ws`);
    await new Promise((resolve) => client.on('open', resolve));

    const sent = { type: 'terminal-input', sessionId: 'abc', data: 'ls\n' };
    client.send(JSON.stringify(sent));

    await new Promise((resolve) => setTimeout(resolve, 100));

    assert.equal(received.length, 1);
    assert.deepStrictEqual(received[0], sent);
  } finally {
    if (client && client.readyState === WebSocket.OPEN) {
      client.close();
    }
    await stop();
    fs.rmSync(publicDir, { recursive: true, force: true });
  }
});
