import { previewListing, sourceFromUrl } from './preview.js';
import { uniqueSuggestions } from './dedupe.js';
import { getCriteria, saveCriteria, runSearch, usdRate, overBudget } from './suggestions.js';

// API de "Nos mudamos": acceso por dispositivo + lista de departamentos.

const COOKIE = 'nm_device';
const COOKIE_MAX_AGE = 60 * 60 * 24 * 400; // ~13 meses, el máximo que aceptan los navegadores

const APARTMENT_FIELDS = {
  url: 'text', source: 'text', title: 'text', barrio: 'text', address: 'text', photo_url: 'text',
  price: 'int', currency: 'text', expensas: 'int',
  ambientes: 'int', dormitorios: 'int', banos: 'int', m2_cubiertos: 'int', m2_totales: 'int',
  piso: 'text', antiguedad: 'int',
  pileta: 'bool', mascotas: 'bool', cochera: 'bool', balcon: 'bool', amenities: 'text',
  status: 'text', rating: 'int', notes: 'text', visit_date: 'text', agency: 'text', contact: 'text',
};
const STATUSES = ['nuevo', 'contactado', 'visita', 'favorito', 'descartado'];

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(request);
    try {
      return await handleApi(request, env, url);
    } catch (err) {
      if (err instanceof HttpError) return json({ error: err.message }, err.status);
      console.error(err);
      return json({ error: 'Error interno' }, 500);
    }
  },

  async scheduled(event, env, ctx) {
    ctx.waitUntil(runSearch(env));
  },
};

async function handleApi(request, env, url) {
  const path = url.pathname.replace(/\/+$/, '');
  const method = request.method;

  if (path === '/api/login' && method === 'POST') return login(request, env);

  const device = await currentDevice(request, env);
  if (!device) throw new HttpError(401, 'Este dispositivo no está autorizado');

  if (path === '/api/me' && method === 'GET') return json({ device });
  if (path === '/api/logout' && method === 'POST') {
    await env.DB.prepare('DELETE FROM devices WHERE id = ?').bind(device.id).run();
    return json({ ok: true }, 200, { 'Set-Cookie': cookie('', 0) });
  }

  if (path === '/api/devices' && method === 'GET') {
    const { results } = await env.DB
      .prepare('SELECT id, name, created_at, last_seen FROM devices ORDER BY created_at')
      .all();
    return json({ devices: results.map((d) => ({ ...d, current: d.id === device.id })) });
  }
  let m = path.match(/^\/api\/devices\/(\d+)$/);
  if (m && method === 'DELETE') {
    await env.DB.prepare('DELETE FROM devices WHERE id = ?').bind(Number(m[1])).run();
    return json({ ok: true });
  }

  if (path === '/api/preview' && method === 'GET') {
    return json({ preview: await previewListing(url.searchParams.get('url')) });
  }

  if (path === '/api/criteria' && method === 'GET') return json({ criteria: await getCriteria(env) });
  if (path === '/api/criteria' && method === 'PUT') {
    return json({ criteria: await saveCriteria(env, await readJson(request)) });
  }

  if (path === '/api/suggestions' && method === 'GET') {
    const { results } = await env.DB
      .prepare("SELECT * FROM suggestions WHERE status = 'nueva' ORDER BY mascotas = 1 DESC, found_at DESC")
      .all();
    // El tope se aplica al mostrar, así un cambio de criterios se ve enseguida
    const [criteria, rate] = await Promise.all([getCriteria(env), usdRate(env)]);
    const { results: ours } = await env.DB
      .prepare('SELECT url, address, price, currency, m2_cubiertos, m2_totales, ambientes FROM apartments')
      .all();
    const unique = uniqueSuggestions(results, ours);
    const visible = unique.filter((s) => !overBudget(s, criteria, rate));
    const last = await env.DB.prepare("SELECT value FROM settings WHERE key = 'last_run'").first();
    return json({
      suggestions: visible,
      hidden: unique.length - visible.length,
      duplicates: results.length - unique.length,
      usdRate: rate,
      lastRun: last ? JSON.parse(last.value) : null,
    });
  }
  if (path === '/api/suggestions/run' && method === 'POST') {
    return json({ summary: await runSearch(env) });
  }
  m = path.match(/^\/api\/suggestions\/(\d+)\/(accept|dismiss)$/);
  if (m && method === 'POST') {
    const s = await env.DB.prepare('SELECT * FROM suggestions WHERE id = ?').bind(Number(m[1])).first();
    if (!s) throw new HttpError(404, 'No existe');
    if (m[2] === 'dismiss') {
      await env.DB.prepare("UPDATE suggestions SET status = 'descartada' WHERE id = ?").bind(s.id).run();
      return json({ ok: true });
    }
    const data = cleanApartment({ ...s, status: 'nuevo', title: s.title || 'Sin título' }, true);
    const cols = Object.keys(data);
    const row = await env.DB
      .prepare(`INSERT INTO apartments (${cols.join(', ')}, created_by)
                VALUES (${cols.map(() => '?').join(', ')}, ?) RETURNING *`)
      .bind(...cols.map((c) => data[c]), device.id)
      .first();
    await env.DB.prepare("UPDATE suggestions SET status = 'agregada' WHERE id = ?").bind(s.id).run();
    return json({ apartment: row }, 201);
  }

  if (path === '/api/apartments' && method === 'GET') {
    const { results } = await env.DB
      .prepare('SELECT * FROM apartments ORDER BY updated_at DESC')
      .all();
    return json({ apartments: results });
  }
  if (path === '/api/apartments' && method === 'POST') {
    const data = cleanApartment(await readJson(request), true);
    const cols = Object.keys(data);
    const row = await env.DB
      .prepare(`INSERT INTO apartments (${cols.join(', ')}, created_by)
                VALUES (${cols.map(() => '?').join(', ')}, ?) RETURNING *`)
      .bind(...cols.map((c) => data[c]), device.id)
      .first();
    return json({ apartment: row }, 201);
  }
  m = path.match(/^\/api\/apartments\/(\d+)$/);
  if (m && method === 'PUT') {
    const data = cleanApartment(await readJson(request), false);
    const cols = Object.keys(data);
    if (!cols.length) throw new HttpError(400, 'No hay cambios');
    const row = await env.DB
      .prepare(`UPDATE apartments SET ${cols.map((c) => `${c} = ?`).join(', ')},
                updated_at = datetime('now') WHERE id = ? RETURNING *`)
      .bind(...cols.map((c) => data[c]), Number(m[1]))
      .first();
    if (!row) throw new HttpError(404, 'No existe');
    return json({ apartment: row });
  }
  if (m && method === 'DELETE') {
    await env.DB.prepare('DELETE FROM apartments WHERE id = ?').bind(Number(m[1])).run();
    return json({ ok: true });
  }

  throw new HttpError(404, 'No encontrado');
}

// --- Acceso por dispositivo ---

async function login(request, env) {
  const { code, name } = await readJson(request);
  if (!env.ACCESS_CODE) throw new HttpError(500, 'Falta configurar ACCESS_CODE');
  if (typeof code !== 'string' || !(await safeEqual(code.trim(), env.ACCESS_CODE))) {
    await new Promise((r) => setTimeout(r, 1000)); // frena intentos a ciegas
    throw new HttpError(401, 'Código incorrecto');
  }
  const deviceName = String(name || '').trim().slice(0, 60) || 'Dispositivo';
  const token = randomToken();
  await env.DB
    .prepare("INSERT INTO devices (name, token_hash, last_seen) VALUES (?, ?, datetime('now'))")
    .bind(deviceName, await sha256(token))
    .run();
  return json({ ok: true }, 200, { 'Set-Cookie': cookie(token, COOKIE_MAX_AGE) });
}

async function currentDevice(request, env) {
  const token = readCookie(request, COOKIE);
  if (!token) return null;
  const device = await env.DB
    .prepare('SELECT id, name, created_at FROM devices WHERE token_hash = ?')
    .bind(await sha256(token))
    .first();
  if (device) {
    await env.DB.prepare("UPDATE devices SET last_seen = datetime('now') WHERE id = ?")
      .bind(device.id).run();
  }
  return device;
}

function cookie(value, maxAge) {
  return `${COOKIE}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
}

function readCookie(request, name) {
  const header = request.headers.get('Cookie') || '';
  for (const part of header.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return v.join('=');
  }
  return null;
}

function randomToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function sha256(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function safeEqual(a, b) {
  // Compara los hashes para no filtrar el largo ni el contenido por tiempo
  const [ha, hb] = await Promise.all([sha256(a), sha256(b)]);
  let diff = 0;
  for (let i = 0; i < ha.length; i++) diff |= ha.charCodeAt(i) ^ hb.charCodeAt(i);
  return diff === 0;
}

// --- Utilidades ---

function cleanApartment(input, isNew) {
  if (!input || typeof input !== 'object') throw new HttpError(400, 'Datos inválidos');
  const out = {};
  for (const [key, type] of Object.entries(APARTMENT_FIELDS)) {
    if (!(key in input)) continue;
    let v = input[key];
    if (v === '' || v === undefined) v = null;
    if (v !== null) {
      if (type === 'int') {
        v = Number(v);
        if (!Number.isFinite(v)) throw new HttpError(400, `${key} debe ser un número`);
        v = Math.round(v);
      } else if (type === 'bool') {
        v = v === true || v === 1 || v === '1' || v === 'true' ? 1 : 0;
      } else {
        v = String(v).trim().slice(0, 4000);
      }
    }
    out[key] = v;
  }
  if (out.status != null && !STATUSES.includes(out.status)) {
    throw new HttpError(400, 'Estado inválido');
  }
  if (out.url && !out.source) out.source = sourceFromUrl(out.url);
  if (isNew && !out.title) throw new HttpError(400, 'Falta el título');
  if (!isNew && 'title' in out && !out.title) throw new HttpError(400, 'Falta el título');
  return out;
}

async function readJson(request) {
  try {
    return await request.json();
  } catch {
    throw new HttpError(400, 'JSON inválido');
  }
}

function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers },
  });
}

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
