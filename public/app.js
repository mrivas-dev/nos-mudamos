const STATUSES = {
  nuevo: 'Nuevo',
  contactado: 'Contactado',
  visita: 'Visita',
  favorito: 'Favorito',
  descartado: 'Descartado',
};

const $ = (sel) => document.querySelector(sel);
let apartments = [];
let filter = 'activos';
let editing = null;

async function api(path, options = {}) {
  const res = await fetch(path, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && path !== '/api/login') {
    showLogin();
    throw new Error(data.error || 'No autorizado');
  }
  if (!res.ok) throw new Error(data.error || 'Algo salió mal');
  return data;
}

// --- Acceso ---

function showLogin() {
  $('#app').hidden = true;
  $('#login').hidden = false;
}

$('#login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = new FormData(e.target);
  $('#login-error').textContent = '';
  try {
    await api('/api/login', {
      method: 'POST',
      body: { code: form.get('code'), name: form.get('name') || guessDeviceName() },
    });
    e.target.reset();
    start();
  } catch (err) {
    $('#login-error').textContent = err.message;
  }
});

function guessDeviceName() {
  const ua = navigator.userAgent;
  if (/iPhone/.test(ua)) return 'iPhone';
  if (/Android/.test(ua)) return 'Android';
  if (/Mac/.test(ua)) return 'Mac';
  if (/Windows/.test(ua)) return 'Windows';
  return 'Dispositivo';
}

// --- Lista ---

async function start() {
  try {
    await api('/api/me');
  } catch {
    return;
  }
  $('#login').hidden = true;
  $('#app').hidden = false;
  await load();
}

async function load() {
  const data = await api('/api/apartments');
  apartments = data.apartments;
  render();
  loadSuggestions();
}

// --- Sugeridos ---

let criteria = null;

function showView(name) {
  $('#view-list').hidden = name !== 'list';
  $('#view-sug').hidden = name !== 'sug';
  $('#add').hidden = name !== 'list';
  $('#tab-list').classList.toggle('active', name === 'list');
  $('#tab-sug').classList.toggle('active', name === 'sug');
}
$('#tab-list').onclick = () => showView('list');
$('#tab-sug').onclick = () => showView('sug');

async function loadSuggestions() {
  const [{ suggestions, lastRun, hidden }, c] = await Promise.all([api('/api/suggestions'), api('/api/criteria')]);
  criteria = c.criteria;
  $('#sug-count').textContent = suggestions.length ? `(${suggestions.length})` : '';
  $('#sug-empty').hidden = suggestions.length > 0;
  $('#sug-list').replaceChildren(...suggestions.map((sug) => card(sug, true)));
  $('#criteria-text').textContent = criteriaText(criteria);
  $('#last-run').textContent =
    (lastRun ? lastRunText(lastRun) : 'Todavía no se corrió ninguna búsqueda.') +
    (hidden ? ` · ${hidden} oculta${hidden === 1 ? '' : 's'} por pasarse del tope` : '');
}

function criteriaText(c) {
  const parts = [
    `${c.ambientes} ambientes en alquiler`,
    `en ${c.barrios.map((b) => b.replace(/(^|\s)\S/g, (x) => x.toUpperCase())).join(', ')}`,
    c.maxPrice
      ? `hasta ${c.currency === 'USD' ? 'US$' : '$'} ${c.maxPrice.toLocaleString('es-AR')} por mes con expensas`
      : 'sin tope de precio',
    c.requirePileta ? 'con pileta' : null,
    c.preferMascotas ? 'mascotas primero' : null,
  ].filter(Boolean);
  return `Buscamos ${parts.join(', ')}.`;
}

function lastRunText(run) {
  const when = formatDate(run.at);
  const bits = Object.entries(run.summary).map(([site, r]) =>
    r.error ? `${SOURCE_NAMES[site]}: error` : `${SOURCE_NAMES[site]}: ${r.added} nuevas${r.errors?.length ? ' (con problemas)' : ''}`,
  );
  return `Última búsqueda: ${when} · ${bits.join(' · ')}`;
}

async function actOnSuggestion(sug, action) {
  await api(`/api/suggestions/${sug.id}/${action}`, { method: 'POST' });
  await load();
}

$('#run-search').onclick = async () => {
  const btn = $('#run-search');
  btn.disabled = true;
  btn.textContent = 'Buscando…';
  try {
    await api('/api/suggestions/run', { method: 'POST' });
    await loadSuggestions();
  } catch (err) {
    $('#last-run').textContent = err.message;
  } finally {
    btn.disabled = false;
    btn.textContent = 'Buscar ahora';
  }
};

$('#edit-criteria').onclick = () => {
  const f = $('#criteria-form');
  f.elements.barrios.value = criteria.barrios.join(', ');
  f.elements.ambientes.value = criteria.ambientes;
  f.elements.maxPrice.value = criteria.maxPrice ?? '';
  f.elements.currency.value = criteria.currency;
  f.elements.requirePileta.checked = criteria.requirePileta;
  f.elements.preferMascotas.checked = criteria.preferMascotas;
  for (const el of f.querySelectorAll('[name=sources]')) el.checked = criteria.sources.includes(el.value);
  $('#criteria-dialog').showModal();
};
$('#criteria-cancel').onclick = () => $('#criteria-dialog').close();
$('#criteria-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = e.target;
  await api('/api/criteria', {
    method: 'PUT',
    body: {
      barrios: f.elements.barrios.value.split(','),
      ambientes: f.elements.ambientes.value,
      maxPrice: f.elements.maxPrice.value,
      currency: f.elements.currency.value,
      requirePileta: f.elements.requirePileta.checked,
      preferMascotas: f.elements.preferMascotas.checked,
      sources: [...f.querySelectorAll('[name=sources]:checked')].map((el) => el.value),
    },
  });
  $('#criteria-dialog').close();
  await loadSuggestions();
});

function render() {
  const counts = { activos: 0, todos: apartments.length };
  for (const a of apartments) {
    counts[a.status] = (counts[a.status] || 0) + 1;
    if (a.status !== 'descartado') counts.activos++;
  }
  const tabs = { activos: 'Activos', ...STATUSES, todos: 'Todos' };
  $('#filters').replaceChildren(
    ...Object.entries(tabs).map(([key, label]) => {
      const b = document.createElement('button');
      b.textContent = `${label} ${counts[key] || 0}`;
      b.className = key === filter ? 'active' : '';
      b.onclick = () => { filter = key; render(); };
      return b;
    }),
  );

  const visible = apartments.filter((a) =>
    filter === 'todos' ? true : filter === 'activos' ? a.status !== 'descartado' : a.status === filter,
  );
  $('#empty').hidden = visible.length > 0;
  $('#list').replaceChildren(...visible.map(card));
}

function card(a, suggestion = false) {
  const li = document.createElement('li');
  li.className = `card status-${a.status}`;
  const yes = (v, label) => (v === 1 ? label : null);
  const facts = [
    a.ambientes && `${a.ambientes} amb.`,
    a.dormitorios != null && `${a.dormitorios} dorm.`,
    a.banos != null && `${a.banos} baño${a.banos === 1 ? '' : 's'}`,
    (a.m2_cubiertos || a.m2_totales) && `${a.m2_cubiertos || a.m2_totales} m²`,
    a.piso && `Piso ${a.piso}`,
  ].filter(Boolean);
  const perks = [
    a.pileta === 1 ? '🏊 Pileta' : a.pileta === 0 ? '❌ Sin pileta' : '❓ Pileta',
    a.mascotas === 1 ? '🐾 Mascotas' : a.mascotas === 0 ? '🚫 Mascotas' : null,
    yes(a.cochera, '🚗 Cochera'),
    yes(a.balcon, '🌿 Balcón'),
  ].filter(Boolean);
  li.innerHTML = `
    ${a.photo_url ? '<img class="photo" alt="" loading="lazy">' : ''}
    <div class="card-body">
      <div class="card-head">
        <span class="badge">${suggestion ? SOURCE_NAMES[a.source] || a.source : STATUSES[a.status] || a.status}</span>
        ${a.rating ? `<span class="stars">${'★'.repeat(a.rating)}</span>` : ''}
      </div>
      <h3></h3>
      <p class="where"></p>
      <p class="price"></p>
      <p class="facts"></p>
      <p class="perks"></p>
      <p class="visit"></p>
      ${a.notes ? '<p class="notes"></p>' : ''}
      ${a.url ? '<a class="link" target="_blank" rel="noopener"></a>' : ''}
    </div>
  `;
  if (a.photo_url) li.querySelector('.photo').src = safeUrl(a.photo_url);
  li.querySelector('h3').textContent = a.title;
  li.querySelector('.where').textContent = [a.barrio, a.address].filter(Boolean).join(' · ');
  li.querySelector('.price').textContent = priceText(a);
  li.querySelector('.facts').textContent = facts.join(' · ');
  li.querySelector('.perks').textContent = perks.join('  ');
  li.querySelector('.visit').textContent = a.visit_date ? `📅 Visita: ${formatDate(a.visit_date)}` : '';
  if (a.notes) li.querySelector('.notes').textContent = a.notes;
  if (a.url) {
    const link = li.querySelector('.link');
    link.href = safeUrl(a.url);
    link.textContent = `Ver en ${SOURCE_NAMES[a.source] || 'la publicación'} ↗`;
    link.onclick = (e) => e.stopPropagation();
  }
  if (suggestion) {
    const actions = document.createElement('div');
    actions.className = 'card-actions';
    const dismiss = document.createElement('button');
    dismiss.className = 'secondary small';
    dismiss.textContent = 'Descartar';
    dismiss.onclick = (e) => { e.stopPropagation(); actOnSuggestion(a, 'dismiss'); };
    const accept = document.createElement('button');
    accept.className = 'small';
    accept.textContent = 'Agregar a la lista';
    accept.onclick = (e) => { e.stopPropagation(); actOnSuggestion(a, 'accept'); };
    actions.append(dismiss, accept);
    li.querySelector('.card-body').append(actions);
    li.classList.remove(`status-${a.status}`);
    li.onclick = () => a.url && window.open(safeUrl(a.url), '_blank', 'noopener');
  } else {
    li.onclick = () => openForm(a);
  }
  return li;
}

const SOURCE_NAMES = { zonaprop: 'Zonaprop', argenprop: 'Argenprop', mercadolibre: 'MercadoLibre' };

function formatDate(v) {
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return v;
  return d.toLocaleString('es-AR', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

function priceText(a) {
  const fmt = (n) => n.toLocaleString('es-AR');
  if (a.price == null) return a.expensas != null ? `Expensas $ ${fmt(a.expensas)}` : '';
  if (a.currency === 'USD') {
    return `US$ ${fmt(a.price)}${a.expensas != null ? ` + $ ${fmt(a.expensas)} exp.` : ''}`;
  }
  if (a.expensas == null) return `$ ${fmt(a.price)}`;
  return `$ ${fmt(a.price + a.expensas)} por mes ($ ${fmt(a.price)} + ${fmt(a.expensas)} exp.)`;
}

function safeUrl(url) {
  try {
    const u = new URL(url);
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.href : '#';
  } catch {
    return '#';
  }
}

// --- Formulario ---

$('#status-select').replaceChildren(
  ...Object.entries(STATUSES).map(([v, label]) => new Option(label, v)),
);

function openForm(a = null) {
  editing = a;
  const form = $('#apt-form');
  form.reset();
  $('#apt-error').textContent = '';
  $('#autofill-msg').textContent = '';
  $('#apt-title').textContent = a ? 'Editar departamento' : 'Nuevo departamento';
  $('#apt-delete').hidden = !a;
  if (a) {
    for (const el of form.elements) {
      if (!el.name || !(el.name in a)) continue;
      if (el.type === 'checkbox') el.checked = a[el.name] === 1;
      else el.value = a[el.name] ?? '';
    }
  }
  $('#apt-dialog').showModal();
}

$('#add').onclick = () => openForm();

$('#autofill').onclick = async () => {
  const form = $('#apt-form');
  const link = form.elements.url.value.trim();
  const msg = $('#autofill-msg');
  if (!link) { msg.textContent = 'Pegá primero el link.'; return; }
  msg.textContent = 'Buscando datos…';
  try {
    const { preview } = await api(`/api/preview?url=${encodeURIComponent(link)}`);
    if (preview.error) { msg.textContent = `${preview.error}. Completalo a mano.`; return; }
    let filled = 0;
    for (const [k, v] of Object.entries(preview)) {
      const el = form.elements[k];
      if (!el || el.name === 'url' || (el.tagName !== 'SELECT' && el.value)) continue; // no pisa lo que ya escribieron
      el.value = v;
      filled++;
    }
    msg.textContent = filled ? `Listo, completé ${filled} datos. Revisalos antes de guardar.` : 'No encontré datos nuevos en la publicación.';
  } catch (err) {
    msg.textContent = err.message;
  }
};
$('#apt-cancel').onclick = () => $('#apt-dialog').close();

$('#apt-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = e.target;
  const body = {};
  for (const el of form.elements) {
    if (!el.name) continue;
    body[el.name] = el.type === 'checkbox' ? el.checked : el.value;
  }
  try {
    if (editing) await api(`/api/apartments/${editing.id}`, { method: 'PUT', body });
    else await api('/api/apartments', { method: 'POST', body });
    $('#apt-dialog').close();
    await load();
  } catch (err) {
    $('#apt-error').textContent = err.message;
  }
});

$('#apt-delete').onclick = async () => {
  if (!editing || !confirm(`¿Borrar "${editing.title}"?`)) return;
  await api(`/api/apartments/${editing.id}`, { method: 'DELETE' });
  $('#apt-dialog').close();
  await load();
};

// --- Dispositivos ---

$('#open-devices').onclick = async () => {
  await renderDevices();
  $('#devices-dialog').showModal();
};
$('#devices-close').onclick = () => $('#devices-dialog').close();

async function renderDevices() {
  const { devices } = await api('/api/devices');
  $('#devices').replaceChildren(
    ...devices.map((d) => {
      const li = document.createElement('li');
      const info = document.createElement('div');
      info.innerHTML = '<strong></strong><small></small>';
      info.querySelector('strong').textContent = d.name + (d.current ? ' (este)' : '');
      info.querySelector('small').textContent = `Último uso: ${d.last_seen || '–'}`;
      const b = document.createElement('button');
      b.className = 'danger small';
      b.textContent = d.current ? 'Salir' : 'Quitar';
      b.onclick = async () => {
        if (!confirm(d.current ? '¿Salir de este dispositivo?' : `¿Quitar acceso a "${d.name}"?`)) return;
        if (d.current) {
          await api('/api/logout', { method: 'POST' });
          $('#devices-dialog').close();
          showLogin();
        } else {
          await api(`/api/devices/${d.id}`, { method: 'DELETE' });
          await renderDevices();
        }
      };
      li.append(info, b);
      return li;
    }),
  );
}

start();
