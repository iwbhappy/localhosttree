import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { projectFromCommand, describeProcess, probeWeb } from '../lib/discovery.mjs';

test('recognizes Vite and Python project paths, including spaces', () => {
  assert.deepEqual(projectFromCommand('"node" "C:\\PROJECTS\\Safe Way\\frontend\\node_modules\\vite\\bin\\vite.js" --port 3000'), { name: 'Safe Way', directory: 'C:\\PROJECTS\\Safe Way\\frontend' });
  assert.deepEqual(projectFromCommand('"C:\\PROJECTS\\ModusTradeHack\\backend\\.venv\\Scripts\\python.exe" -m app'), { name: 'ModusTradeHack', directory: 'C:\\PROJECTS\\ModusTradeHack\\backend' });
  assert.equal(projectFromCommand('"C:\\SOFTS\\NODEJSS\\node.exe" "C:\\SOFTS\\NODEJSS\\node_modules\\npm\\bin\\npm-cli.js" run dev'), null);
});
test('finds project from parent process without looping through cyclic parents', () => {
  const processes = new Map([[1, { ProcessId: 1, ParentProcessId: 2, Name: 'node.exe', CommandLine: 'next-server' }], [2, { ProcessId: 2, ParentProcessId: 1, CommandLine: '"node" "C:\\PROJECTS\\SafeWay\\node_modules\\next\\dist\\bin\\next" dev' }]]);
  const result = describeProcess(processes.get(1), processes);
  assert.equal(result.project.name, 'SafeWay'); assert.equal(result.kind, 'web'); assert.equal(result.isRuntime, true);
});
test('HTTP probe reads titles and handles non-web listeners', async t => {
  const server = http.createServer((req, res) => { res.writeHead(200, { 'Content-Type': 'text/html' }); res.end('<title>SafeWay &amp; Dashboard</title>'); });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => server.close());
  const result = await probeWeb(server.address().port, '0.0.0.0');
  assert.equal(result.title, 'SafeWay & Dashboard'); assert.equal(result.hostname, '127.0.0.1');
  const port = server.address().port;
  await new Promise(resolve => server.close(resolve));
  assert.equal(await probeWeb(port, '127.0.0.1'), null);
});
test('HTTP probe supports IPv6-only listeners', async t => {
  const server = http.createServer((req, res) => { res.writeHead(404, { 'Content-Type': 'application/json' }); res.end('{}'); });
  await new Promise((resolve, reject) => server.once('error', reject).listen(0, '::1', resolve));
  t.after(() => server.close());
  const result = await probeWeb(server.address().port, '::1');
  assert.equal(result.http, true); assert.equal(result.status, 404); assert.equal(result.hostname, '::1');
});
