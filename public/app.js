const $ = selector => document.querySelector(selector);
const state = { rows: [], filter: 'all', query: '', showSystem: localStorage.getItem('show-system') === 'true', loading: false, editing: null };
const labels = { web: 'Веб-приложение', service: 'Сервис', database: 'База данных' };
const symbols = { web: '⌘', service: '›_', database: '▤', system: '⚙' };
const isWidget = location.pathname.replace(/\/$/, '') === '/widget' || new URLSearchParams(location.search).has('widget');
if (isWidget) { document.body.classList.add('widget'); document.title = 'Localhost Tree — виджет'; }
document.querySelectorAll('[data-view]').forEach(link => {
  const active = link.dataset.view === (isWidget ? 'widget' : 'browser');
  link.classList.toggle('current', active);
  if (active) link.setAttribute('aria-current', 'page');
});
$('#show-system').checked = state.showSystem;

function node(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}
function action(label, className, text, click) {
  const button = node('button', className, text);
  button.type = 'button'; button.title = label; button.setAttribute('aria-label', label);
  button.addEventListener('click', click);
  return button;
}
function render() {
  const projects = state.rows.filter(row => !row.system || row.favorite || row.customName);
  $('#stat-active').textContent = projects.filter(r => r.online).length;
  $('#stat-web').textContent = projects.filter(r => r.online && r.url).length;
  $('#stat-favorites').textContent = state.rows.filter(r => r.favorite).length;
  const rows = state.rows.filter(row => {
    if (!state.showSystem && row.system && !row.favorite && !row.customName) return false;
    if (state.filter === 'web' && !row.url) return false;
    if (state.filter === 'service' && row.url) return false;
    if (state.filter === 'favorites' && !row.favorite) return false;
    return `${row.name} ${row.port} ${row.process || ''} ${row.directory || ''} ${row.project || ''} ${row.pid || ''}`.toLocaleLowerCase().includes(state.query);
  }).sort((a, b) => Number(b.favorite) - Number(a.favorite) || Number(b.online) - Number(a.online) || a.port - b.port);
  $('#row-count').textContent = rows.length;
  const body = $('#ports'); body.replaceChildren();
  if (!rows.length) {
    const tr = node('tr'); const td = node('td', 'empty', state.query ? 'По этому запросу ничего не найдено.' : state.filter === 'favorites' ? 'Нажми ☆ рядом с портом, чтобы добавить его в избранное.' : 'Здесь пока пусто. Запусти проект или включи системные порты.');
    td.colSpan = 6; tr.append(td); body.append(tr); return;
  }
  for (const row of rows) {
    const tr = node('tr');
    const favorite = node('td');
    const star = action(row.favorite ? 'Убрать из избранного' : 'В избранное', `star${row.favorite ? ' selected' : ''}`, row.favorite ? '★' : '☆', async () => {
      star.disabled = true;
      try { await save(row.port, { favorite: !row.favorite }); await refresh(); } catch (e) { showError(e.message); } finally { star.disabled = false; }
    });
    star.setAttribute('aria-pressed', String(row.favorite)); favorite.append(star);
    const project = node('td'); const cell = node('div', `project-cell${row.online ? '' : ' off'}`);
    const kind = row.system ? 'system' : row.kind;
    cell.append(node('div', `project-icon ${kind}`, symbols[kind] || '›_'));
    const info = node('div'); const name = node('div', 'project-name'); name.append(node('span', '', row.name)); name.title = row.name;
    name.append(action('Изменить название', 'edit', '✎', () => edit(row)));
    info.append(name);
    const desc = node('div', 'project-description', row.directory || (row.online ? labels[row.kind] || 'Системный процесс' : 'Сохранённый порт'));
    desc.title = row.directory || desc.textContent; info.append(desc); cell.append(info); project.append(cell);
    const port = node('td'); port.append(node('span', 'port', `:${row.port}`));
    const process = node('td'); process.append(node('div', 'process', row.process || '—')); if (row.pid) process.append(node('div', 'pid', `PID ${row.pid}`));
    const status = node('td'); const badge = node('span', `badge${row.online ? '' : ' off'}`); badge.append(node('span', 'status-dot'), node('span', '', row.online ? 'Запущен' : 'Выключен'));
    status.append(badge); status.title = row.online ? `${row.exposure === 'network' ? 'Слушает на сетевом интерфейсе' : 'Только этот компьютер'} · ${row.addresses.join(', ')}${row.httpStatus ? ` · HTTP ${row.httpStatus}` : ''}` : 'На этом порту сейчас нет слушающего процесса';
    const actions = node('td'); const actionBox = node('div', 'row-actions');
    if (row.url) { const link = node('a', 'open-link', 'Открыть ↗'); link.href = row.url; link.target = '_blank'; link.rel = 'noopener noreferrer'; link.setAttribute('aria-label', `Открыть ${row.name} на порту ${row.port}`); actionBox.append(link); }
    actionBox.append(action('Скопировать адрес', 'copy', '⧉', async event => {
      const button = event.currentTarget;
      try { await navigator.clipboard.writeText(row.url || `localhost:${row.port}`); button.textContent = '✓'; setTimeout(() => { if (button.isConnected) button.textContent = '⧉'; }, 1600); }
      catch { showError('Не удалось скопировать адрес. Разрешите доступ к буферу обмена.'); }
    })); actions.append(actionBox);
    tr.append(favorite, project, port, process, status, actions); body.append(tr);
  }
}
function showError(message) { $('#error').textContent = message; $('#error').hidden = false; }
async function save(port, data) {
  const response = await fetch(`/api/ports/${port}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
  const body = await response.json(); if (!response.ok) throw new Error(body.error || 'Не удалось сохранить');
}
async function refresh() {
  if (state.loading) return;
  state.loading = true; $('#refresh').disabled = true;
  try {
    const response = await fetch('/api/ports', { signal: AbortSignal.timeout(22000) });
    const data = await response.json(); if (!response.ok) throw new Error(data.error);
    state.rows = data.ports; $('#error').hidden = true; $('#live').classList.remove('offline'); $('#live-text').textContent = 'Автообновление включено';
    $('#updated').textContent = `Обновлено в ${new Date(data.updatedAt).toLocaleTimeString('ru-RU')}`; render();
  } catch (error) {
    $('#live').classList.add('offline'); $('#live-text').textContent = 'Нет соединения';
    showError(error.name === 'TimeoutError' ? 'Сканирование заняло слишком много времени. Повторим автоматически.' : error.message === 'Failed to fetch' ? 'Сервер недоступен. Запусти Localhost Tree ещё раз.' : error.message);
    $('#updated').textContent = state.rows.length ? 'Показаны последние полученные данные' : 'Данные ещё не получены';
    if (!state.rows.length) { const cell = $('#ports td'); if (cell) cell.textContent = 'Не удалось загрузить порты. Нажми «Обновить», чтобы повторить.'; }
  } finally { state.loading = false; $('#refresh').disabled = false; }
}
function edit(row) {
  state.editing = row.port; $('#project-name').value = row.customName || ''; $('#project-name').placeholder = row.name;
  $('#edit-port').textContent = `localhost:${row.port}`; $('#edit-error').hidden = true; $('#edit-dialog').showModal(); $('#project-name').focus();
}
$('#edit-form').addEventListener('submit', async event => {
  event.preventDefault(); $('#save-name').disabled = true;
  try { await save(state.editing, { name: $('#project-name').value }); $('#edit-dialog').close(); await refresh(); }
  catch (error) { $('#edit-error').textContent = error.message; $('#edit-error').hidden = false; }
  finally { $('#save-name').disabled = false; }
});
$('#close-dialog').addEventListener('click', () => $('#edit-dialog').close());
$('#cancel-edit').addEventListener('click', () => $('#edit-dialog').close());
$('#refresh').addEventListener('click', refresh);
$('#search').addEventListener('input', event => { state.query = event.target.value.toLocaleLowerCase().trim(); render(); });
$('#show-system').addEventListener('change', event => { state.showSystem = event.target.checked; localStorage.setItem('show-system', state.showSystem); render(); });
document.querySelectorAll('.filter').forEach(button => button.addEventListener('click', () => {
  state.filter = button.dataset.filter;
  document.querySelectorAll('.filter').forEach(b => { b.classList.toggle('active', b === button); b.setAttribute('aria-pressed', String(b === button)); }); render();
}));
document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
setInterval(() => { if (!document.hidden) refresh(); }, 8000);
refresh();
