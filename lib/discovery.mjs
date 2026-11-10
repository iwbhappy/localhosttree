import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const exec = promisify(execFile);
const scanScript = fileURLToPath(new URL('../scripts/scan.ps1', import.meta.url));
const runtime = /^(node|bun|deno|python[\d.]*|pythonw|java|dotnet|php|ruby|go|uvicorn|uv|ollama)(\.exe)?$/i;
const known = new Map([
  [5432, ['PostgreSQL', 'database']], [3306, ['MySQL', 'database']],
  [6379, ['Redis', 'database']], [27017, ['MongoDB', 'database']],
  [1433, ['SQL Server', 'database']], [5037, ['Android Debug Bridge', 'service']],
]);
const webPorts = new Set([3000, 3001, 3002, 4000, 4173, 4200, 5000, 5001, 5173, 5174, 5175, 5500, 5600, 8000, 8001, 8080, 8081, 8888, 9000]);
const titleCache = new Map();

export function projectFromCommand(command = '') {
  const paths = command.match(/[A-Za-z]:\\[^"\r\n]+/g) || [];
  for (let candidate of paths) {
    candidate = candidate.split(/\s+(?:--?|\/c\b)/)[0].trim();
    const boundary = candidate.search(/\\(?:node_modules|\.venv|venv)(?:\\|$)/i);
    if (boundary >= 0) candidate = candidate.slice(0, boundary);
    else if (/\.(?:[cm]?js|tsx?|py|dll|jar)(?:\s|$)/i.test(candidate)) candidate = path.win32.dirname(candidate.split(/\.(?:[cm]?js|tsx?|py|dll|jar)/i)[0] + '.js');
    else continue;
    if (/\\(?:windows|program files(?: \(x86\))?|nodejss)(?:\\|$)/i.test(candidate)) continue;
    if (/\\(?:frontend|backend|client|server|web|api)$/i.test(candidate)) {
      return { name: path.win32.basename(path.win32.dirname(candidate)), directory: candidate };
    }
    return { name: path.win32.basename(candidate), directory: candidate };
  }
  return null;
}

export function describeProcess(process, processes) {
  let current = process;
  let project = null;
  let commands = '';
  const seen = new Set();
  for (let depth = 0; current && depth < 5 && !seen.has(current.ProcessId); depth++) {
    seen.add(current.ProcessId);
    commands += ' ' + (current.CommandLine || '');
    project ||= projectFromCommand(current.CommandLine || '');
    current = processes.get(current.ParentProcessId);
  }
  const kind = /(?:vite|next[\\/]|next-server|react-scripts|nuxt|angular)/i.test(commands) ? 'web' : 'service';
  return { project, kind, isRuntime: runtime.test(process?.Name || '') };
}

export function probeWeb(port, address) {
  return new Promise(resolve => {
    let settled = false;
    let timer;
    const finish = value => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(value);
    };
    const hostname = address === '::' || address === '::1' ? '::1' : address === '0.0.0.0' ? '127.0.0.1' : address;
    const req = http.get({ hostname, port, path: '/', headers: { Host: `localhost:${port}`, Accept: 'text/html', 'User-Agent': 'LocalhostTree/1.0' } }, res => {
      let body = '';
      const result = () => {
        const raw = body.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1];
        const title = raw?.replace(/<[^>]*>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/\s+/g, ' ').trim().slice(0, 100);
        finish({ http: true, title: title || null, status: res.statusCode, hostname });
      };
      if (!String(res.headers['content-type'] || '').includes('text/html')) {
        result();
        res.destroy();
        return;
      }
      res.setEncoding('utf8');
      res.on('data', chunk => {
        body += chunk;
        if (body.length > 32768 || /<\/title>/i.test(body)) { result(); res.destroy(); }
      });
      res.on('end', result);
      res.on('error', () => finish(null));
    });
    req.on('error', () => finish(null));
    timer = setTimeout(() => { finish(null); req.destroy(); }, 1300);
  });
}

export async function discover(ownPort) {
  const { stdout } = await exec('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', scanScript], {
    windowsHide: true, timeout: 15000, maxBuffer: 8 * 1024 * 1024, encoding: 'utf8',
  });
  const snapshot = JSON.parse(stdout.replace(/^\uFEFF/, ''));
  const processes = new Map(snapshot.processes.map(p => [p.ProcessId, p]));
  const grouped = new Map();
  for (const connection of snapshot.connections) {
    if (connection.LocalPort === ownPort && connection.OwningProcess === process.pid) continue;
    const key = `${connection.LocalPort}:${connection.OwningProcess}`;
    if (!grouped.has(key)) grouped.set(key, { port: connection.LocalPort, pid: connection.OwningProcess, addresses: [] });
    grouped.get(key).addresses.push(connection.LocalAddress);
  }
  const rows = await Promise.all([...grouped.values()].map(async row => {
    const process = processes.get(row.pid);
    const detail = describeProcess(process, processes);
    const service = known.get(row.port);
    const system = !detail.isRuntime && !detail.project && !service && !webPorts.has(row.port);
    let web = null;
    if (!service && (detail.isRuntime || webPorts.has(row.port))) {
      const key = `${row.port}:${row.pid}:${row.addresses.join(',')}`;
      const cached = titleCache.get(key);
      if (cached && cached.expires > Date.now()) web = cached.value;
      else {
        const address = row.addresses.find(a => a === '127.0.0.1' || a === '0.0.0.0') || row.addresses[0];
        web = await probeWeb(row.port, address);
        titleCache.set(key, { value: web, expires: Date.now() + (web ? 30000 : 10000) });
      }
    }
    return {
      ...row, name: web?.title || detail.project?.name || service?.[0] || process?.Name?.replace(/\.exe$/i, '') || `PID ${row.pid}`,
      project: detail.project?.name || null, directory: detail.project?.directory || null,
      process: process?.Name || 'System', kind: service?.[1] || (web && detail.kind !== 'service' ? 'web' : web && !detail.isRuntime ? 'web' : detail.kind),
      system, url: web ? `http://${web.hostname.includes(':') ? `[${web.hostname}]` : web.hostname}:${row.port}` : null,
      httpStatus: web?.status || null,
      exposure: row.addresses.some(a => a === '0.0.0.0' || a === '::') ? 'network' : row.addresses.every(a => a === '127.0.0.1' || a === '::1') ? 'local' : 'network',
      online: true,
    };
  }));
  // Discard entries for processes that have stopped; avoid unbounded cache growth.
  if (titleCache.size > 500) titleCache.clear();
  return rows.sort((a, b) => a.port - b.port || a.pid - b.pid);
}
