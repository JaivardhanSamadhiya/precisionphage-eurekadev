import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { request } from 'node:http';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';

function get(port, path) {
  return new Promise((resolve, reject) => {
    const req = request({ hostname: '127.0.0.1', port, path, method: 'GET' }, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks).toString('utf8') }));
    });
    req.on('error', reject);
    req.setTimeout(4000, () => req.destroy(new Error(`Request timed out: ${path}`)));
    req.end();
  });
}

function waitForReady(child) {
  return new Promise((resolve, reject) => {
    let output = '';
    let errorOutput = '';
    const timer = setTimeout(() => {
      finish(new Error(`Server did not report an assigned port. stdout: ${output}; stderr: ${errorOutput}`));
    }, 8000);
    function finish(error, port) {
      clearTimeout(timer);
      child.stdout.off('data', onData);
      child.stderr.off('data', onErrorData);
      child.off('error', onError);
      child.off('exit', onExit);
      if (error) reject(error);
      else resolve(port);
    }
    function onData(chunk) {
      output += chunk;
      const match = output.match(/PrecisionPhage: http:\/\/127\.0\.0\.1:(\d+)/);
      if (match && Number(match[1]) > 0) finish(null, Number(match[1]));
    }
    function onErrorData(chunk) { errorOutput += chunk; }
    function onError(error) { finish(error); }
    function onExit(code) { finish(new Error(`Server exited before ready (${code}): ${errorOutput}`)); }
    child.stdout.on('data', onData);
    child.stderr.on('data', onErrorData);
    child.on('error', onError);
    child.on('exit', onExit);
  });
}

async function stopServer(child) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  const exited = once(child, 'exit');
  child.kill('SIGTERM');
  const forceKill = setTimeout(() => child.kill('SIGKILL'), 1500);
  try { await exited; }
  finally { clearTimeout(forceKill); }
}

test('static server serves the website and data while blocking traversal and malformed paths', { timeout: 15000 }, async (t) => {
  const child = spawn(process.execPath, ['scripts/serve.mjs'], {
    cwd: fileURLToPath(new URL('../', import.meta.url)),
    env: { ...process.env, PORT: '0' },
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  try {
    const port = await waitForReady(child);
    await t.test('root serves the application with safe static response headers', async () => {
      const response = await get(port, '/');
      assert.equal(response.status, 200);
      assert.match(response.headers['content-type'], /^text\/html/);
      assert.equal(response.headers['x-content-type-options'], 'nosniff');
      assert.equal(response.headers['cache-control'], 'no-store');
      assert.match(response.body, /PrecisionPhage/);
      assert.match(response.body, /app\.js/);
    });
    await t.test('compact data and browser JavaScript use their correct content types', async () => {
      const [data, script, planner] = await Promise.all([
        get(port, '/data/bank.json'),
        get(port, '/app.js'),
        get(port, '/planner.js'),
      ]);
      assert.equal(data.status, 200);
      assert.match(data.headers['content-type'], /^application\/json/);
      assert.equal(JSON.parse(data.body).schemaVersion, 1);
      assert.equal(JSON.parse(data.body).banks.length, 2);
      for (const response of [script, planner]) {
        assert.equal(response.status, 200);
        assert.match(response.headers['content-type'], /^text\/javascript/);
      }
      assert.match(planner.body, /export function planScreen/);
    });
    await t.test('encoded traversal cannot expose repository files outside public', async () => {
      for (const path of ['/..%2fpackage.json', '/%2e%2e%2fscripts%2fserve.mjs', '/..%2fpublicity%2fsecret']) {
        const response = await get(port, path);
        assert.equal(response.status, 403, path);
        assert.equal(response.body, 'Forbidden');
      }
    });
    await t.test('missing files return 404 and invalid percent encodings return 400', async () => {
      const missing = await get(port, '/not-a-file.json');
      assert.equal(missing.status, 404);
      assert.equal(missing.body, 'File unavailable');
      const malformed = await get(port, '/%E0%A4%A');
      assert.equal(malformed.status, 400);
      const query = await get(port, '/?demo=1');
      assert.equal(query.status, 200);
    });
  } finally {
    await stopServer(child);
  }
});
