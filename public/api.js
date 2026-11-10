const $ = selector => document.querySelector(selector);
const state = { endpoint: '/api', data: null, timer: null, controller: null, generation: 0 };
const filters = ['#api-search', '#api-status', '#api-kind', '#api-system', '#api-favorites'];
const incoming = new URLSearchParams(location.search);
$('#api-search').value = incoming.get('q') || '';
$('#api-status').value = incoming.get('status') || '';
$('#api-kind').value = incoming.get('kind') || '';
$('#api-system').checked = incoming.get('system') === 'true';
$('#api-favorites').checked = incoming.get('favorites') === 'true';

function requestUrl() {
  const url = new URL(state.endpoint, location.origin);
  if (state.endpoint === '/api/health') return url;
  if (state.endpoint === '/api') url.searchParams.set('format', 'json');
  url.searchParams.set('system', String($('#api-system').checked));
  for (const [key, selector] of [['q', '#api-search'], ['status', '#api-status'], ['kind', '#api-kind']]) {
    const value = $(selector).value.trim(); if (value) url.searchParams.set(key, value);
  }
  if ($('#api-favorites').checked) url.searchParams.set('favorites', 'true');
  return url;
}

function highlight(value) {
  const fragment = document.createDocumentFragment();
  const json = JSON.stringify(value, null, 2);
  const pattern = /"(?:\\.|[^"\\])*"\s*:|"(?:\\.|[^"\\])*"|\b(?:true|false|null)\b|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/g;
  let offset = 0;
  for (const match of json.matchAll(pattern)) {
    fragment.append(document.createTextNode(json.slice(offset, match.index)));
    const token = document.createElement('span');
    token.className = /:$/.test(match[0]) ? 'json-key' : match[0].startsWith('"') ? 'json-string' : /^(true|false|null)$/.test(match[0]) ? 'json-literal' : 'json-number';
    token.textContent = match[0]; fragment.append(token); offset = match.index + match[0].length;
  }
  fragment.append(document.createTextNode(json.slice(offset))); return fragment;
}

async function refresh() {
  const generation = ++state.generation;
  state.controller?.abort(); const controller = new AbortController(); state.controller = controller;
  const timeout = setTimeout(() => controller.abort(), 22000);
  const url = requestUrl(); $('#request-url').textContent = url.href;
  $('#api-example').textContent = `// JavaScript / Node.js\nconst response = await fetch(${JSON.stringify(url.href)}, {\n  headers: { Accept: 'application/json' }\n});\nconst data = await response.json();\n\n# PowerShell\nInvoke-RestMethod -Uri '${url.href}'`;
  const start = performance.now();
  try {
    const response = await fetch(url, { headers: { Accept: 'application/json' }, signal: controller.signal });
    const data = await response.json();
    if (generation !== state.generation) return;
    state.data = data; $('#json-response').replaceChildren(highlight(data));
    $('#copy-json').disabled = false; $('#download-json').disabled = false;
    $('#api-status-text').textContent = `${response.status} ${response.statusText} · ${Math.round(performance.now() - start)} мс`;
    $('#api-live').classList.toggle('offline', !response.ok);
    $('#api-error').hidden = response.ok;
    if (!response.ok) $('#api-error').textContent = data.error || 'Ошибка запроса';
    $('#api-summary').textContent = data.ports ? `${data.ports.length} записей · ${new Date(data.updatedAt).toLocaleTimeString('ru-RU')}` : `${data.app || 'Localhost Tree'} · v${data.version || '—'}`;
  } catch (error) {
    if (generation !== state.generation) return;
    $('#api-error').hidden = false;
    $('#api-error').textContent = error.name === 'AbortError' ? 'Истекло время ожидания. Повтори запрос.' : 'Сервер недоступен. Запусти Localhost Tree ещё раз.';
    $('#api-status-text').textContent = 'Нет соединения'; $('#api-live').classList.add('offline');
    $('#api-summary').textContent = state.data ? 'Показан последний полученный ответ' : '';
  } finally { clearTimeout(timeout); }
}

document.querySelectorAll('[data-endpoint]').forEach(button => button.addEventListener('click', () => {
  clearTimeout(state.timer); state.endpoint = button.dataset.endpoint;
  document.querySelectorAll('[data-endpoint]').forEach(b => { b.classList.toggle('current', b === button); b.setAttribute('aria-pressed', String(b === button)); });
  filters.forEach(selector => { $(selector).disabled = state.endpoint === '/api/health'; }); refresh();
}));
filters.forEach(selector => $(selector).addEventListener(selector === '#api-search' ? 'input' : 'change', () => {
  clearTimeout(state.timer); state.timer = setTimeout(refresh, selector === '#api-search' ? 250 : 0);
}));
$('#api-refresh').addEventListener('click', () => { clearTimeout(state.timer); refresh(); });
$('#copy-json').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText(JSON.stringify(state.data, null, 2)); $('#copy-json').textContent = 'Скопировано ✓'; setTimeout(() => { $('#copy-json').textContent = 'Копировать JSON'; }, 1600); }
  catch { $('#api-error').hidden = false; $('#api-error').textContent = 'Разреши браузеру доступ к буферу обмена.'; }
});
$('#download-json').addEventListener('click', () => {
  const url = URL.createObjectURL(new Blob([JSON.stringify(state.data, null, 2) + '\n'], { type: 'application/json' }));
  const link = document.createElement('a'); link.href = url; link.download = 'localhost-tree.json'; document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
});
setInterval(() => { if (!document.hidden && $('#api-auto').checked) refresh(); }, 8000);
document.addEventListener('visibilitychange', () => { if (!document.hidden && $('#api-auto').checked) refresh(); });
refresh();
