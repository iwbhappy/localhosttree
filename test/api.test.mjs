import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, cp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';

test('live Windows API: scan, persistence, stopped ports, validation and origin checks', { timeout: 45000 }, async t => {
  const directory = await mkdtemp(path.join(tmpdir(), 'localhost-tree-test-'));
  const fixture = http.createServer((req, res) => { res.writeHead(200, { 'Content-Type': 'text/html' }); res.end('<title>Tree integration fixture</title>'); });
  await new Promise(resolve => fixture.listen(0, '127.0.0.1', resolve));
  const fixturePort = fixture.address().port;
  const reservation = http.createServer();
  await new Promise(resolve => reservation.listen(0, '127.0.0.1', resolve));
  const port = reservation.address().port;
  await new Promise(resolve => reservation.close(resolve));
  for (const file of ['server.mjs', 'lib', 'scripts', 'public']) await cp(new URL(`../${file}`, import.meta.url), path.join(directory, file), { recursive: true });
  const server = spawn(process.execPath, [path.join(directory, 'server.mjs')], { env: { ...process.env, LOCALHOST_TREE_PORT: String(port) }, windowsHide: true, stdio: 'ignore' });
  t.after(async () => {
    fixture.close();
    await new Promise(resolve => { if (server.exitCode !== null) resolve(); else { server.once('exit', resolve); server.kill(); } });
    await rm(directory, { recursive: true, force: true });
  });
  const base = `http://127.0.0.1:${port}`;
  let ready = false;
  for (let i = 0; i < 50; i++) { try { if ((await fetch(`${base}/api/health`)).ok) { ready = true; break; } } catch {} await delay(100); }
  assert.equal(ready, true);
  assert.equal((await fetch(base)).status, 200);
  assert.equal((await fetch(`${base}/api/ports`, { headers: { Origin: 'http://evil.example' } })).status, 403);
  const rejectedHost = await new Promise((resolve, reject) => {
    http.get(`${base}/api/health`, { headers: { Host: 'evil.example' } }, response => { response.resume(); resolve(response.statusCode); }).on('error', reject);
  });
  assert.equal(rejectedHost, 403);
  const data = await (await fetch(`${base}/api/ports`)).json();
  assert.ok(data.ports.length > 0);
  const own = data.ports.find(row => row.port === port); assert.equal(own, undefined);
  const fixtureRow = data.ports.find(row => row.port === fixturePort);
  assert.equal(fixtureRow.name, 'Tree integration fixture'); assert.equal(fixtureRow.online, true);
  assert.equal(JSON.stringify(data).includes('CommandLine'), false);
  const update = body => fetch(`${base}/api/ports/${fixturePort}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  assert.equal((await update({ name: 'SafeWay', favorite: true })).status, 200);
  assert.equal((await update({ name: 123 })).status, 400);
  assert.equal((await update({ favorite: 'yes' })).status, 400);
  assert.equal((await update(null)).status, 400);
  const saved = (await (await fetch(`${base}/api/ports`)).json()).ports.find(row => row.port === fixturePort);
  assert.equal(saved.name, 'SafeWay'); assert.equal(saved.favorite, true);
  await new Promise(resolve => fixture.close(resolve));
  await delay(4200);
  const offline = (await (await fetch(`${base}/api/ports`)).json()).ports.find(row => row.port === fixturePort);
  assert.equal(offline.online, false); assert.equal(offline.name, 'SafeWay');
  const persisted = JSON.parse(await (await import('node:fs/promises')).readFile(path.join(directory, 'data/ports.json'), 'utf8'));
  assert.equal(persisted[fixturePort].name, 'SafeWay');
  assert.equal((await update({ name: '', favorite: false })).status, 200);
  const cleared = (await (await fetch(`${base}/api/ports`)).json()).ports.find(row => row.port === fixturePort);
  assert.equal(cleared, undefined);
});
