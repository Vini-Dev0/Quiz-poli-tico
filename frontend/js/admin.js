import { api, setText, signed } from './common.js';
const login = document.getElementById('login-form');
if (login) {
  login.addEventListener('submit', async event => {
    event.preventDefault();
    document.getElementById('login-button').disabled = true;
    document.getElementById('login-error').hidden = true;
    try {
      await api('/admin/login', { method: 'POST', body: JSON.stringify({ password: document.getElementById('admin-password').value }) });
      location.replace('/admin');
    } catch (error) { setText('login-error', error.message); document.getElementById('login-error').hidden = false; }
    finally { document.getElementById('login-button').disabled = false; }
  });
} else {
  const form = document.getElementById('filter-form');
  const formatter = new Intl.NumberFormat('pt-BR');
  const percent = value => `${Number(value).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
  let page = 1;
  let pointsPage = 1;
  let points = [];
  let pointsTotal = 0;
  let controller;
  let generation = 0;
  let refreshBusy = false;
  let tableBusy = false;
  let pointsBusy = false;
  let lastTable;
  function filters() {
    const params = new URLSearchParams(new FormData(form));
    for (const [key, value] of [...params]) if (value === 'all') params.delete(key);
    return params;
  }
  function errorMessage(error) {
    if (error.name === 'AbortError') return;
    if (error.status === 401) { location.replace('/admin/login'); return; }
    setText('admin-error', error.message);
    document.getElementById('admin-error').hidden = false;
  }
  function bars(id, data) {
    const container = document.getElementById(id);
    container.replaceChildren();
    if (!data.length) { const empty = document.createElement('p'); empty.className = 'empty-state'; empty.textContent = 'Nenhum resultado neste filtro.'; container.append(empty); return; }
    const total = data.reduce((sum, item) => sum + item.count, 0);
    for (const item of data) {
      const row = document.createElement('div'); row.className = 'bar-row';
      const heading = document.createElement('div');
      const label = document.createElement('span'); label.textContent = item.label;
      const count = document.createElement('b'); count.textContent = formatter.format(item.count);
      const bar = document.createElement('progress'); bar.max = total || 1; bar.value = item.count;
      bar.setAttribute('aria-label', `${item.label}: ${item.count} resultados, ${percent(total ? item.count / total * 100 : 0)}`);
      heading.append(label, count); row.append(heading, bar); container.append(row);
    }
  }
  function stats(data) {
    for (const key of ['started', 'completed', 'abandoned', 'shared', 'notShared']) {
      setText(`metric-${key}`, formatter.format(data[key]));
      setText(`funnel-${key}`, formatter.format(data[key]));
    }
    setText('rate-completion', percent(data.completionRate));
    setText('rate-abandonment', percent(data.abandonmentRate));
    setText('rate-share', percent(data.shareRate));
    setText('active-sessions', `${formatter.format(data.active)} em andamento`);
    document.getElementById('funnel-bar-started').value = data.started ? 100 : 0;
    document.getElementById('funnel-bar-completed').value = data.completionRate;
    document.getElementById('funnel-bar-shared').value = data.started ? data.shared / data.started * 100 : 0;
  }
  function drawScatter() {
    const canvas = document.getElementById('scatter-chart');
    const ctx = canvas.getContext('2d');
    const width = 800, height = 650, padding = 9;
    ctx.clearRect(0, 0, width, height);
    ctx.lineWidth = 1;
    ctx.strokeStyle = '#ffffff09';
    for (let i = 0; i <= 10; i++) {
      const x = padding + i * (width - 2 * padding) / 10;
      const y = padding + i * (height - 2 * padding) / 10;
      ctx.beginPath(); ctx.moveTo(x, padding); ctx.lineTo(x, height - padding); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(padding, y); ctx.lineTo(width - padding, y); ctx.stroke();
    }
    ctx.strokeStyle = '#b090cb65'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(width / 2, padding); ctx.lineTo(width / 2, height - padding); ctx.moveTo(padding, height / 2); ctx.lineTo(width - padding, height / 2); ctx.stroke();
    ctx.fillStyle = '#84659e'; ctx.font = '14px system-ui';
    ctx.fillText('0', width / 2 + 8, height / 2 + 19);
    ctx.fillText('−100', padding + 3, height / 2 + 19);
    ctx.fillText('+100', width - padding - 40, height / 2 + 19);
    for (const point of points) {
      const x = padding + (point.economicScore + 100) / 200 * (width - 2 * padding);
      const y = padding + (100 - point.authorityScore) / 200 * (height - 2 * padding);
      ctx.beginPath(); ctx.arc(x, y, 4.5, 0, Math.PI * 2); ctx.fillStyle = '#c3a7f780'; ctx.fill();
    }
    canvas.setAttribute('aria-label', `Gráfico político: ${points.length} de ${pointsTotal} resultados, eixo econômico −100 a +100 e autoridade −100 a +100.`);
    document.getElementById('scatter-empty').hidden = pointsTotal !== 0;
    setText('scatter-count', `${formatter.format(points.length)} de ${formatter.format(pointsTotal)} pontos · sem identificadores`);
    document.getElementById('load-points').hidden = points.length >= pointsTotal;
  }
  function table(data) {
    lastTable = data;
    const tbody = document.getElementById('results-table'); tbody.replaceChildren();
    if (!data.data.length) { const row = document.createElement('tr'); const cell = document.createElement('td'); cell.colSpan = 9; cell.className = 'empty-state'; cell.textContent = 'Nenhuma sessão encontrada para estes filtros.'; row.append(cell); tbody.append(row); }
    const date = value => value ? new Date(value).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '—';
    for (const session of data.data) {
      const row = document.createElement('tr');
      const values = [session.uuid, session.status, `${session.currentQuestion}/40`, session.economicScore === null ? '—' : signed(session.economicScore), session.authorityScore === null ? '—' : signed(session.authorityScore), session.politicalLabel || '—', session.status !== 'COMPLETED' ? '—' : session.shared ? 'Sim' : 'Não', date(session.startedAt), date(session.completedAt)];
      values.forEach((value, index) => {
        const cell = document.createElement('td');
        if (index === 0) { cell.className = 'uuid-cell'; cell.title = session.uuid; if (session.status === 'COMPLETED') { const link = document.createElement('a'); link.href = `/resultado/${session.uuid}`; link.target = '_blank'; link.rel = 'noopener'; link.textContent = value; cell.append(link); } else cell.textContent = value; }
        else if (index === 1) { const badge = document.createElement('span'); badge.className = `status-badge status-${session.status}`; badge.textContent = { STARTED: 'Em andamento', COMPLETED: 'Concluiu', ABANDONED: 'Abandonou' }[session.status]; cell.append(badge); }
        else cell.textContent = value;
        row.append(cell);
      }); tbody.append(row);
    }
    setText('table-count', data.total ? `${formatter.format((data.page - 1) * data.limit + 1)}–${formatter.format(Math.min(data.page * data.limit, data.total))} de ${formatter.format(data.total)} sessões` : '0 sessões');
    setText('page-label', `Página ${data.totalPages ? data.page : 0} de ${data.totalPages}`);
    document.getElementById('previous-page').disabled = data.page <= 1;
    document.getElementById('next-page').disabled = data.page >= data.totalPages;
  }
  async function fetchTable(signal = controller?.signal) {
    const current = generation;
    const params = filters(); params.set('page', page); params.set('limit', 25); params.set('sort', document.getElementById('sort').value);
    const data = await api(`/admin/results?${params}`, { signal });
    if (generation === current) table(data);
  }
  async function refresh() {
    controller?.abort(); controller = new AbortController();
    const signal = controller.signal;
    const current = ++generation;
    page = 1; pointsPage = 1; points = [];
    refreshBusy = true; document.getElementById('refresh').disabled = true;
    document.getElementById('admin-error').hidden = true;
    const query = filters().toString();
    const active = [...form.querySelectorAll('select')].filter(select => select.value !== 'all').map(select => select.selectedOptions[0].textContent);
    setText('filter-description', active.length ? `Recorte ativo: ${active.join(' · ')}. As taxas usam somente as sessões deste recorte.` : 'Todas as sessões · números acumulados');
    const responses = await Promise.allSettled([
      api(`/admin/stats?${query}`, { signal }).then(data => { if (generation === current) stats(data); }),
      api(`/admin/distribution?${query}`, { signal }).then(data => { if (generation === current) { bars('economic-chart', data.economic); bars('authority-chart', data.authority); bars('political-chart', data.political); } }),
      api(`/admin/scatter?${query}&page=1&limit=1000`, { signal }).then(data => { if (generation === current) { points = data.data; pointsTotal = data.total; drawScatter(); } }),
      fetchTable(signal)
    ]);
    if (generation !== current) return;
    responses.forEach(response => { if (response.status === 'rejected') errorMessage(response.reason); });
    if (responses.every(response => response.status === 'fulfilled')) setText('last-updated', `Atualizado às ${new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`);
    refreshBusy = false; document.getElementById('refresh').disabled = false;
  }
  async function changePage(direction = 0) {
    if (tableBusy || refreshBusy) return;
    tableBusy = true;
    const oldPage = page;
    const current = generation;
    page = direction ? page + direction : 1;
    document.getElementById('previous-page').disabled = true; document.getElementById('next-page').disabled = true;
    try { await fetchTable(); } catch (error) { if (generation === current) { page = oldPage; if (lastTable) table(lastTable); errorMessage(error); } } finally { tableBusy = false; }
  }
  form.addEventListener('submit', event => { event.preventDefault(); refresh(); });
  form.addEventListener('change', refresh);
  document.getElementById('reset-filters').addEventListener('click', () => { form.reset(); refresh(); });
  document.getElementById('refresh').addEventListener('click', refresh);
  document.getElementById('sort').addEventListener('change', () => changePage());
  document.getElementById('previous-page').addEventListener('click', () => changePage(-1));
  document.getElementById('next-page').addEventListener('click', () => changePage(1));
  document.getElementById('load-points').addEventListener('click', async () => {
    if (pointsBusy || refreshBusy) return;
    pointsBusy = true;
    const button = document.getElementById('load-points'); button.disabled = true;
    const current = generation;
    try {
      const query = filters(); query.set('page', pointsPage + 1); query.set('limit', 1000);
      const data = await api(`/admin/scatter?${query}`, { signal: controller.signal });
      if (generation === current) { pointsPage++; points.push(...data.data); pointsTotal = data.total; drawScatter(); }
    } catch (error) { errorMessage(error); } finally { button.disabled = false; pointsBusy = false; }
  });
  document.getElementById('logout').addEventListener('click', async () => { try { await api('/admin/logout', { method: 'POST' }); location.replace('/admin/login'); } catch (error) { errorMessage(error); } });
  document.querySelectorAll('.admin-sidebar nav a').forEach(link => link.addEventListener('click', () => { document.querySelector('.admin-sidebar nav .active')?.classList.remove('active'); link.classList.add('active'); }));
  await refresh();
  setInterval(() => { if (!document.hidden && !refreshBusy && !tableBusy && !pointsBusy && page === 1) refresh(); }, 60_000);
}
