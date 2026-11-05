import { leerFilas, actualizarCampo, agregarUrl, COLUMNAS } from './sheets.js';
import { leerAviso, fuenteDe } from './scrape.js';

const json = (data, status = 200) => Response.json(data, { status });

async function guardarAviso(env, url, datos, extra = {}) {
  const d = { fuente: fuenteDe(url), titulo: null, barrio: null, ambientes: null, precio: null, moneda: null, expensas: null, foto: null, ...datos };
  await env.DB.prepare(
    `INSERT INTO avisos (url, fuente, titulo, barrio, ambientes, precio, moneda, expensas, foto, manual, error, actualizado)
     VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,datetime('now'))
     ON CONFLICT(url) DO UPDATE SET fuente=?2, titulo=?3, barrio=?4, ambientes=?5, precio=?6, moneda=?7,
       expensas=?8, foto=?9, manual=?10, error=?11, actualizado=datetime('now')`,
  ).bind(url, d.fuente, d.titulo, d.barrio, d.ambientes, d.precio, d.moneda, d.expensas, d.foto, extra.manual ? 1 : 0, extra.error ?? null).run();
}

async function traerAviso(env, url) {
  try {
    await guardarAviso(env, url, await leerAviso(url));
  } catch (e) {
    await guardarAviso(env, url, {}, { error: String(e.message || e) });
  }
}

async function listar(env, ctx) {
  const [filas, { results }] = await Promise.all([leerFilas(env), env.DB.prepare('SELECT * FROM avisos').all()]);
  const porUrl = new Map(results.map((a) => [a.url, a]));
  // Avisos que nunca se leyeron: se leen en segundo plano y aparecen en la próxima carga.
  const nuevos = filas.filter((f) => !porUrl.has(f.url));
  nuevos.forEach((f) => ctx.waitUntil(traerAviso(env, f.url)));
  return filas.map((f) => ({ ...f, aviso: porUrl.get(f.url) ?? null, leyendo: !porUrl.has(f.url) }));
}

async function manejar(request, env, ctx) {
  const { pathname } = new URL(request.url);
  const m = request.method;

  if (m === 'GET' && pathname === '/api/deptos') return json(await listar(env, ctx));

  if (m === 'POST' && pathname === '/api/deptos') {
    const { url } = await request.json();
    try { new URL(url); } catch { return json({ error: 'Link inválido' }, 400); }
    await agregarUrl(env, url);
    ctx.waitUntil(traerAviso(env, url));
    return json({ ok: true }, 201);
  }

  // Cambiar contactado / respondio / visita / notas de una fila de la hoja.
  const campo = pathname.match(/^\/api\/deptos\/(\d+)$/);
  if (m === 'PATCH' && campo) {
    const cambios = await request.json();
    for (const [k, v] of Object.entries(cambios)) {
      if (!(k in COLUMNAS)) return json({ error: `Campo inválido: ${k}` }, 400);
      await actualizarCampo(env, Number(campo[1]), k, v);
    }
    return json({ ok: true });
  }

  // Releer el aviso (o cargar precio/foto a mano, por ejemplo para Zonaprop).
  if (m === 'POST' && pathname === '/api/aviso') {
    const { url, manual } = await request.json();
    if (manual) await guardarAviso(env, url, manual, { manual: true });
    else await traerAviso(env, url);
    return json({ ok: true });
  }

  return json({ error: 'No existe' }, 404);
}

export default {
  async fetch(request, env, ctx) {
    const { pathname } = new URL(request.url);
    if (!pathname.startsWith('/api/')) return env.ASSETS.fetch(request);
    if (env.ACCESS_CODE && request.headers.get('x-codigo') !== env.ACCESS_CODE) return json({ error: 'Código incorrecto' }, 401);
    try {
      return await manejar(request, env, ctx);
    } catch (e) {
      return json({ error: String(e.message || e) }, 500);
    }
  },
};
