const $ = (s) => document.querySelector(s);
const estado = { deptos: [], filtro: 'todos', texto: '', abierto: null };
const FILTROS = [['todos', 'Todos'], ['contactados', 'Contactados'], ['visita', 'Con visita'], ['pendientes', 'Sin contactar']];

async function api(ruta, opciones = {}) {
  const codigo = localStorage.getItem('codigo') || '';
  const r = await fetch(ruta, { ...opciones, headers: { 'content-type': 'application/json', 'x-codigo': codigo } });
  if (r.status === 401) {
    const c = prompt('Código de acceso');
    if (c) { localStorage.setItem('codigo', c); return api(ruta, opciones); }
  }
  const datos = await r.json();
  if (!r.ok) throw new Error(datos.error || 'Error');
  return datos;
}

const dinero = (n, moneda) => (n == null ? '—' : `${moneda === 'USD' ? 'US$' : '$'} ${Math.round(n).toLocaleString('es-AR')}`);
const fechaCorta = (v) => {
  const m = String(v).match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/); // la hoja guarda mm/dd/aaaa
  if (m) return `${m[2]}/${m[1]}/${m[3]}`;
  return v;
};
// date input (aaaa-mm-dd) <-> hoja (mm/dd/aaaa)
const aInput = (v) => { const m = String(v).match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/); return m ? `${m[3]}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}` : ''; };
const aHoja = (v) => { const m = v.match(/^(\d{4})-(\d{2})-(\d{2})$/); return m ? `${m[2]}/${m[3]}/${m[1]}` : ''; };
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function visibles() {
  const t = estado.texto.toLowerCase();
  return estado.deptos.filter((d) => {
    const a = d.aviso || {};
    if (t && !`${a.titulo || ''} ${a.barrio || ''} ${d.notas}`.toLowerCase().includes(t)) return false;
    if (estado.filtro === 'contactados') return d.contactado;
    if (estado.filtro === 'visita') return !!d.visita;
    if (estado.filtro === 'pendientes') return !d.contactado;
    return true;
  });
}

function tarjeta(d) {
  const a = d.aviso || {};
  const total = a.precio != null ? (a.precio + (a.expensas || 0)) : null;
  const abierto = estado.abierto === d.fila;
  const titulo = a.titulo || (d.leyendo ? 'Leyendo el aviso…' : (a.fuente ? `Aviso de ${a.fuente}` : 'Aviso'));
  const area = [a.barrio, a.ambientes ? `${a.ambientes} ambientes` : null].filter(Boolean).join(' · ') || a.fuente || '';
  return `<article data-fila="${d.fila}">
    <div class="foto">${a.foto ? `<img src="${esc(a.foto)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : '[Sin foto]'}
      <button class="estado ${d.contactado ? 'si' : ''}" data-accion="contactado"><span class="punto"></span>${d.contactado ? (d.respondio ? 'Respondió' : 'Contactado') : 'Sin contactar'}</button>
    </div>
    <div class="info">
      <h2>${esc(titulo)}</h2>
      <span class="area">${esc(area)}</span>
      <div class="precio"><b>${dinero(a.precio, a.moneda)}</b><span class="por">por mes</span>${total != null && a.expensas ? `<span class="por">·</span><b>Total ${dinero(total, a.moneda)}</b>` : ''}</div>
      <button class="visita ${d.visita ? 'hay' : 'no'}" data-accion="abrir">${d.visita ? `Visita ${esc(fechaCorta(d.visita))}` : 'Sin visita agendada'}</button>
      ${abierto ? detalle(d, a) : ''}
    </div>
  </article>`;
}

function detalle(d, a) {
  return `<div class="detalle">
    <label><input type="checkbox" data-campo="respondio" ${d.respondio ? 'checked' : ''}> Respondió</label>
    <label>Visita <input type="date" data-campo="visita" value="${aInput(d.visita)}"></label>
    <textarea data-campo="notas" placeholder="Notas">${esc(d.notas)}</textarea>
    <div class="fila"><a href="${esc(d.url)}" target="_blank" rel="noopener">Abrir aviso</a>
      <button class="boton claro" data-accion="releer">Releer aviso</button>
      <button class="boton claro" data-accion="manual">Cargar precio/foto a mano</button></div>
    ${a.error ? `<span class="nota error">No se pudo leer: ${esc(a.error)}</span>` : ''}
  </div>`;
}

function pintar() {
  const lista = visibles();
  $('#conteo').textContent = `${estado.deptos.length} guardados · ${estado.deptos.filter((d) => d.visita).length} visitas`;
  $('#filtros').innerHTML = FILTROS.map(([id, n]) => `<button data-filtro="${id}" class="${estado.filtro === id ? 'on' : ''}">${n}</button>`).join('');
  $('#lista').innerHTML = lista.map(tarjeta).join('');
  const av = $('#aviso');
  av.hidden = lista.length > 0;
  av.textContent = estado.deptos.length ? 'No hay departamentos con este filtro.' : 'Todavía no hay departamentos.';
}

async function cargar() {
  try {
    estado.deptos = await api('/api/deptos');
    pintar();
    if (estado.deptos.some((d) => d.leyendo)) setTimeout(cargar, 4000); // esperar a que se lean los avisos nuevos
  } catch (e) {
    $('#conteo').textContent = 'No se pudo cargar';
    $('#aviso').hidden = false; $('#aviso').textContent = e.message;
  }
}

async function guardar(fila, cambios) {
  const d = estado.deptos.find((x) => x.fila === fila);
  Object.assign(d, cambios);
  pintar();
  try { await api(`/api/deptos/${fila}`, { method: 'PATCH', body: JSON.stringify(cambios) }); }
  catch (e) { alert(`No se guardó: ${e.message}`); cargar(); }
}

$('#filtros').addEventListener('click', (e) => { const f = e.target.dataset.filtro; if (f) { estado.filtro = f; pintar(); } });
$('#buscar').addEventListener('input', (e) => { estado.texto = e.target.value; pintar(); });
$('#agregar').addEventListener('click', () => { const f = $('#form-agregar'); f.hidden = !f.hidden; if (!f.hidden) $('#nueva-url').focus(); });
$('#form-agregar').addEventListener('submit', async (e) => {
  e.preventDefault();
  try { await api('/api/deptos', { method: 'POST', body: JSON.stringify({ url: $('#nueva-url').value.trim() }) }); $('#nueva-url').value = ''; e.target.hidden = true; cargar(); }
  catch (err) { alert(err.message); }
});

$('#lista').addEventListener('click', async (e) => {
  const accion = e.target.dataset.accion;
  const card = e.target.closest('article');
  if (!accion || !card) return;
  const fila = Number(card.dataset.fila);
  const d = estado.deptos.find((x) => x.fila === fila);
  if (accion === 'contactado') guardar(fila, { contactado: !d.contactado });
  if (accion === 'abrir') { estado.abierto = estado.abierto === fila ? null : fila; pintar(); }
  if (accion === 'releer') { await api('/api/aviso', { method: 'POST', body: JSON.stringify({ url: d.url }) }); cargar(); }
  if (accion === 'manual') {
    const precio = Number(prompt('Alquiler por mes (solo número)', d.aviso?.precio ?? ''));
    if (!precio) return;
    const moneda = confirm('¿Está en dólares? Aceptar = US$, Cancelar = $') ? 'USD' : 'ARS';
    const expensas = Number(prompt('Expensas (0 si no hay)', d.aviso?.expensas ?? 0)) || null;
    const foto = prompt('Link de la foto (opcional)', d.aviso?.foto ?? '') || null;
    const titulo = prompt('Título (opcional)', d.aviso?.titulo ?? '') || null;
    await api('/api/aviso', { method: 'POST', body: JSON.stringify({ url: d.url, manual: { ...d.aviso, precio, moneda, expensas, foto, titulo } }) });
    cargar();
  }
});

$('#lista').addEventListener('change', (e) => {
  const campo = e.target.dataset.campo;
  const fila = Number(e.target.closest('article')?.dataset.fila);
  if (!campo || !fila) return;
  if (campo === 'respondio') guardar(fila, { respondio: e.target.checked, ...(e.target.checked ? { contactado: true } : {}) });
  if (campo === 'visita') guardar(fila, { visita: aHoja(e.target.value) });
  if (campo === 'notas') guardar(fila, { notas: e.target.value });
});

cargar();
