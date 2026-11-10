import http from 'node:http';
import { readFile, mkdir, writeFile, rename } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { discover } from './lib/discovery.mjs';
import { savedRows, filterRows, summarize, refreshMs } from './lib/api.mjs';

const port = Number(process.env.LOCALHOST_TREE_PORT || 7341);
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('Invalid LOCALHOST_TREE_PORT');
const base = new URL('./', import.meta.url);
const { version } = JSON.parse(await readFile(new URL('./package.json', base), 'utf8'));
const settingsFile = new URL('./data/ports.json', base);
let settings = {};
try { settings = JSON.parse(await readFile(settingsFile, 'utf8')); }
catch (error) { if (error.code !== 'ENOENT') throw error; }
let cache = null;
let pending = null;
let saveQueue = Promise.resolve();

async function snapshot() {
  if (cache && Date.now() - cache.time < 4000) return cache;
  if (!pending) pending = discover(port).then(rows => cache = { time: Date.now(), rows }).finally(() => { pending = null; });
  return pending;
}

function send(res, status, value) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(value, null, 2) + '\n');
}

const assets = { '/': ['index.html', 'text/html'], '/widget': ['index.html', 'text/html'], '/widget/': ['index.html', 'text/html'], '/app.js': ['app.js', 'text/javascript'], '/style.css': ['style.css', 'text/css'], '/api.js': ['api.js', 'text/javascript'], '/api.css': ['api.css', 'text/css'], '/icon.svg': ['icon.svg', 'image/svg+xml'] };
async function asset(res, file, type) {
  const content = await readFile(new URL(`./public/${file}`, base));
  res.writeHead(200, { 'Content-Type': `${type}; charset=utf-8`, 'Cache-Control': 'no-cache' });
  res.end(content);
}
const server = http.createServer(async (req, res) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Content-Security-Policy', "default-src 'self'; style-src 'self'; script-src 'self'; img-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
  if (![`127.0.0.1:${port}`, `localhost:${port}`].includes(req.headers.host)) return send(res, 403, { error: 'Local access only' });
  if (req.headers.origin && ![`http://127.0.0.1:${port}`, `http://localhost:${port}`].includes(req.headers.origin)) return send(res, 403, { error: 'Origin rejected' });
  try {
    const url = new URL(req.url, `http://127.0.0.1:${port}`);
    const apiRoot = url.pathname === '/api' || url.pathname === '/api/';
    if (apiRoot) res.setHeader('Vary', 'Accept');
    if (req.method === 'GET' && apiRoot && url.searchParams.get('format') !== 'json' && String(req.headers.accept || '').includes('text/html')) return await asset(res, 'api.html', 'text/html');
    if (req.method === 'GET' && url.pathname === '/api/health') return send(res, 200, { app: 'localhost-tree', version, port });
    if (req.method === 'GET' && (apiRoot || url.pathname === '/api/ports')) {
      const data = await snapshot();
      let rows;
      try { rows = filterRows(savedRows(data.rows, settings), url.searchParams); }
      catch (error) { return send(res, 400, { error: error.message }); }
      const result = apiRoot ? { app: 'localhost-tree', version, updatedAt: new Date(data.time).toISOString(), refreshMs, summary: summarize(rows), endpoints: { dashboard: '/', widget: '/widget', explorer: '/api', json: '/api?format=json', ports: '/api/ports', health: '/api/health' }, ports: rows } : { updatedAt: new Date(data.time).toISOString(), refreshMs, ports: rows };
      return send(res, 200, result);
    }
    const match = url.pathname.match(/^\/api\/ports\/(\d+)$/);
    if (req.method === 'POST' && match) {
      const selectedPort = Number(match[1]);
      if (selectedPort < 1 || selectedPort > 65535) return send(res, 400, { error: 'Некорректный порт' });
      if (!String(req.headers['content-type']).startsWith('application/json')) return send(res, 415, { error: 'Expected application/json' });
      let raw = '';
      for await (const chunk of req) {
        raw += chunk;
        if (raw.length > 4096) return send(res, 413, { error: 'Request too large' });
      }
      let body;
      try { body = JSON.parse(raw); } catch { return send(res, 400, { error: 'Некорректный JSON' }); }
      if (!body || typeof body !== 'object' || Array.isArray(body) || (body.name !== undefined && (typeof body.name !== 'string' || body.name.length > 100)) || (body.favorite !== undefined && typeof body.favorite !== 'boolean')) return send(res, 400, { error: 'Некорректные настройки' });
      const operation = saveQueue.then(async () => {
        const previous = settings[selectedPort] || {};
        const next = { ...settings, [selectedPort]: { name: body.name === undefined ? previous.name || '' : body.name.trim(), favorite: body.favorite === undefined ? Boolean(previous.favorite) : body.favorite } };
        if (!next[selectedPort].name && !next[selectedPort].favorite) delete next[selectedPort];
        await mkdir(new URL('./data/', base), { recursive: true });
        await writeFile(new URL('./data/ports.tmp', base), JSON.stringify(next, null, 2));
        await rename(new URL('./data/ports.tmp', base), settingsFile);
        settings = next;
      });
      saveQueue = operation.catch(() => {});
      await operation;
      return send(res, 200, { ok: true });
    }
    if (req.method === 'GET' && assets[url.pathname]) {
      const [file, type] = assets[url.pathname];
      return await asset(res, file, type);
    }
    send(res, 404, { error: 'Not found' });
  } catch (error) {
    console.error(error.message);
    send(res, 500, { error: 'Не удалось получить данные. Проверьте, что PowerShell и служба CIM доступны.' });
  }
});
server.requestTimeout = 20000;
server.on('error', error => { console.error(error.code === 'EADDRINUSE' ? `Port ${port} is busy. Set LOCALHOST_TREE_PORT to another port.` : error.message); process.exitCode = 1; });
server.listen(port, '127.0.0.1', () => console.log(`Localhost Tree: http://127.0.0.1:${port}\nProject: ${fileURLToPath(base)}`));
