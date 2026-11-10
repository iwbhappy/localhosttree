import { test } from 'node:test';
import assert from 'node:assert/strict';
import { filterRows, savedRows, summarize } from '../lib/api.mjs';

const snapshot = [
  { port: 3000, pid: 11, name: 'Auto title', online: true, system: false, kind: 'web', url: 'http://127.0.0.1:3000', directory: 'C:\\Projects\\SafeWay' },
  { port: 5432, pid: 22, name: 'PostgreSQL', online: true, system: false, kind: 'database' },
  { port: 135, pid: 33, name: 'System', online: true, system: true, kind: 'service' },
];
test('saved aliases preserve stopped ports and keep independently listening instances', () => {
  const rows = savedRows([...snapshot, { ...snapshot[0], pid: 44 }], { 3000: { name: 'SafeWay', favorite: true }, 8000: { name: 'Backend', favorite: false } });
  assert.equal(rows.filter(row => row.port === 3000).length, 2);
  assert.equal(rows.find(row => row.port === 3000).name, 'SafeWay');
  assert.equal(rows.find(row => row.port === 8000).online, false);
  assert.deepEqual(summarize(rows), { total: 5, online: 4, offline: 1, web: 2, favorites: 2 });
});
test('composes search, category, status and favorite filters', () => {
  const rows = savedRows(snapshot, { 3000: { name: 'SafeWay', favorite: true }, 8000: { name: 'Backend', favorite: false } });
  assert.deepEqual(filterRows(rows, new URLSearchParams('q=safeway&status=online&favorites=true&system=false')).map(row => row.port), [3000]);
  assert.deepEqual(filterRows(rows, new URLSearchParams('kind=database')).map(row => row.port), [5432]);
  assert.deepEqual(filterRows(rows, new URLSearchParams('status=offline')).map(row => row.port), [8000]);
  assert.equal(filterRows(rows, new URLSearchParams('system=false')).length, 3);
  const namedSystem = savedRows(snapshot, { 135: { name: 'RPC', favorite: false } });
  assert.ok(filterRows(namedSystem, new URLSearchParams('system=false')).some(row => row.port === 135));
});
