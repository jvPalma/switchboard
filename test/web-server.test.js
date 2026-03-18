const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { createWebServer } = require('../web-server');

const mockLog = { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} };
const nodeModulesDir = path.join(__dirname, '..', 'node_modules');

test('web server starts and serves static files', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'switchboard-web-'));

  try {
    fs.writeFileSync(
      path.join(tmpDir, 'test.html'),
      '<html><body>switchboard-test-content</body></html>',
      'utf8',
    );

    const { server, stop } = createWebServer({
      port: 0,
      host: '127.0.0.1',
      publicDir: tmpDir,
      nodeModulesDir,
      log: mockLog,
    });

    try {
      await new Promise((resolve, reject) => {
        server.once('listening', resolve);
        server.once('error', reject);
      });

      const { port } = server.address();
      const res = await fetch(`http://127.0.0.1:${port}/test.html`);

      assert.equal(res.status, 200);
      const body = await res.text();
      assert.ok(body.includes('switchboard-test-content'), 'body should contain expected content');
    } finally {
      await stop();
    }
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('binds to 0.0.0.0 by default', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'switchboard-web-bind-'));

  try {
    const { server, stop } = createWebServer({
      port: 0,
      publicDir: tmpDir,
      nodeModulesDir,
      log: mockLog,
    });

    try {
      await new Promise((resolve, reject) => {
        server.once('listening', resolve);
        server.once('error', reject);
      });

      const addr = server.address();
      assert.equal(addr.address, '0.0.0.0');
      assert.ok(typeof addr.port === 'number' && addr.port > 0, 'should bind to a valid port');
    } finally {
      await stop();
    }
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('accepts explicit 127.0.0.1 host', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'switchboard-web-lb-'));

  try {
    const { server, stop } = createWebServer({
      port: 0,
      host: '127.0.0.1',
      publicDir: tmpDir,
      nodeModulesDir,
      log: mockLog,
    });

    try {
      await new Promise((resolve, reject) => {
        server.once('listening', resolve);
        server.once('error', reject);
      });

      const addr = server.address();
      assert.equal(addr.address, '127.0.0.1');
    } finally {
      await stop();
    }
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
