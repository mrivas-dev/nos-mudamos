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
}

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

function card(a) {
  const li = document.createElement('li');
  li.className = `card status-${a.status}`;
  const facts = [
    a.ambientes && `${a.ambientes} amb.`,
    a.m2 && `${a.m2} m²`,
    a.pileta ? '🏊 Pileta' : null,
    a.mascotas === 1 ? '🐾 Mascotas' : a.mascotas === 0 ? '🚫🐾' : null,
  ].filter(Boolean);
  li.innerHTML = `
    <div class="card-head">
      <span class="badge">${STATUSES[a.status] || a.status}</span>
      ${a.rating ? `<span class="stars">${'★'.repeat(a.rating)}</span>` : ''}
    </div>
    <h3></h3>
    <p class="where"></p>
    <p class="price"></p>
    <p class="facts"></p>
    ${a.notes ? '<p class="notes"></p>' : ''}
    ${a.url ? '<a class="link" target="_blank" rel="noopener">Ver publicación ↗</a>' : ''}
  `;
  li.querySelector('h3').textContent = a.title;
  li.querySelector('.where').textContent = [a.barrio, a.address].filter(Boolean).join(' · ');
  li.querySelector('.price').textContent = priceText(a);
  li.querySelector('.facts').textContent = facts.join(' · ');
  if (a.notes) li.querySelector('.notes').textContent = a.notes;
  if (a.url) {
    const link = li.querySelector('.link');
    link.href = safeUrl(a.url);
    link.onclick = (e) => e.stopPropagation();
  }
  li.onclick = () => openForm(a);
  return li;
}

function priceText(a) {
  const fmt = (n) => n.toLocaleString('es-AR');
  const parts = [];
  if (a.price != null) parts.push(`${a.currency === 'USD' ? 'US$' : '$'} ${fmt(a.price)}`);
  if (a.expensas != null) parts.push(`+ $ ${fmt(a.expensas)} exp.`);
  return parts.join(' ');
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
