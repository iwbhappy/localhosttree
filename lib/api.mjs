export const refreshMs = 8000;

export function savedRows(rows, settings) {
  const result = rows.map(row => ({ ...row, customName: settings[row.port]?.name || '', favorite: Boolean(settings[row.port]?.favorite), name: settings[row.port]?.name || row.name }));
  const active = new Set(result.map(row => String(row.port)));
  for (const [port, meta] of Object.entries(settings)) {
    if (!active.has(port) && (meta.name || meta.favorite)) result.push({ port: Number(port), name: meta.name || `Порт ${port}`, customName: meta.name || '', favorite: Boolean(meta.favorite), online: false, system: false, kind: 'service', addresses: [] });
  }
  return result.sort((a, b) => a.port - b.port || (a.pid || 0) - (b.pid || 0));
}

export function filterRows(rows, params) {
  const status = params.get('status');
  const kind = params.get('kind');
  const system = params.get('system');
  const favorites = params.get('favorites');
  if (status !== null && !['online', 'offline'].includes(status)) throw new Error('status: online или offline');
  if (kind !== null && !['web', 'service', 'database'].includes(kind)) throw new Error('kind: web, service или database');
  if (system !== null && !['true', 'false'].includes(system)) throw new Error('system: true или false');
  if (favorites !== null && !['true', 'false'].includes(favorites)) throw new Error('favorites: true или false');
  const query = (params.get('q') || '').trim().toLocaleLowerCase();
  return rows.filter(row => {
    if (system === 'false' && row.system && !row.favorite && !row.customName) return false;
    if (status && row.online !== (status === 'online')) return false;
    if (kind && row.kind !== kind) return false;
    if (favorites && Boolean(row.favorite) !== (favorites === 'true')) return false;
    return `${row.name} ${row.port} ${row.process || ''} ${row.pid || ''} ${row.directory || ''} ${row.project || ''}`.toLocaleLowerCase().includes(query);
  });
}

export function summarize(rows) {
  return {
    total: rows.length,
    online: rows.filter(row => row.online).length,
    offline: rows.filter(row => !row.online).length,
    web: rows.filter(row => row.online && row.url).length,
    favorites: rows.filter(row => row.favorite).length,
  };
}
