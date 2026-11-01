// Búsqueda automática de departamentos nuevos según los criterios guardados.
import { previewListing } from './preview.js';

export const DEFAULT_CRITERIA = {
  barrios: ['palermo'],
  ambientes: 4,
  maxPrice: null,
  currency: 'ARS',
  requirePileta: true,
  preferMascotas: true,
  sources: ['zonaprop', 'argenprop', 'mercadolibre'],
};

const MAX_NEW_PER_SOURCE = 12; // cuántas publicaciones nuevas abre por sitio en cada corrida

const slug = (s) =>
  s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim().replace(/\s+/g, '-');

// URLs de búsqueda de cada sitio y cómo reconocer un link a una publicación
const SITES = {
  zonaprop: {
    searchUrls: (c) =>
      c.barrios.map((b) => `https://www.zonaprop.com.ar/departamentos-alquiler-${slug(b)}-${c.ambientes}-ambientes.html`),
    linkPattern: /href=["']((?:https:\/\/www\.zonaprop\.com\.ar)?\/propiedades\/[^"'?#]+-\d{6,}\.html)/gi,
    base: 'https://www.zonaprop.com.ar',
  },
  argenprop: {
    searchUrls: (c) =>
      c.barrios.map((b) => `https://www.argenprop.com/departamentos/alquiler/${slug(b)}/${c.ambientes}-ambientes`),
    linkPattern: /href=["']((?:https:\/\/www\.argenprop\.com)?\/departamento-en-alquiler-[^"'?#]+--\d{6,})/gi,
    base: 'https://www.argenprop.com',
  },
  mercadolibre: {
    searchUrls: (c) =>
      c.barrios.map(
        (b) => `https://inmuebles.mercadolibre.com.ar/departamentos/alquiler/${c.ambientes}-ambientes/capital-federal/${slug(b)}/`,
      ),
    linkPattern: /href=["'](https:\/\/(?:departamento|inmueble)\.mercadolibre\.com\.ar\/MLA-\d+[^"'?#]*)/gi,
    base: 'https://departamento.mercadolibre.com.ar',
  },
};

export async function getCriteria(env) {
  const row = await env.DB.prepare("SELECT value FROM settings WHERE key = 'criteria'").first();
  return { ...DEFAULT_CRITERIA, ...(row ? JSON.parse(row.value) : {}) };
}

export async function saveCriteria(env, input) {
  const c = { ...DEFAULT_CRITERIA };
  if (Array.isArray(input.barrios)) {
    c.barrios = input.barrios.map((b) => String(b).trim()).filter(Boolean).slice(0, 10);
  }
  if (!c.barrios.length) c.barrios = DEFAULT_CRITERIA.barrios;
  const amb = Number(input.ambientes);
  if (Number.isInteger(amb) && amb > 0 && amb < 10) c.ambientes = amb;
  const max = Number(input.maxPrice);
  c.maxPrice = input.maxPrice != null && input.maxPrice !== '' && max > 0 ? Math.round(max) : null;
  c.currency = input.currency === 'USD' ? 'USD' : 'ARS';
  c.requirePileta = Boolean(input.requirePileta);
  c.preferMascotas = Boolean(input.preferMascotas);
  if (Array.isArray(input.sources)) c.sources = input.sources.filter((s) => s in SITES);
  await env.DB.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('criteria', ?)")
    .bind(JSON.stringify(c)).run();
  return c;
}

// Corre la búsqueda en todos los sitios y guarda lo nuevo. Devuelve un resumen por sitio.
export async function runSearch(env) {
  const criteria = await getCriteria(env);
  const summary = {};
  for (const source of criteria.sources) {
    try {
      summary[source] = await searchSite(env, source, criteria);
    } catch (err) {
      summary[source] = { error: String(err.message || err) };
    }
  }
  await env.DB.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('last_run', ?)")
    .bind(JSON.stringify({ at: new Date().toISOString(), summary })).run();
  return summary;
}

async function searchSite(env, source, criteria) {
  const site = SITES[source];
  const links = new Set();
  const errors = [];
  for (const searchUrl of site.searchUrls(criteria)) {
    const res = await fetch(searchUrl, { headers: BROWSER_HEADERS });
    if (!res.ok) {
      errors.push(`búsqueda respondió ${res.status}`);
      continue;
    }
    const html = await res.text();
    for (const m of html.matchAll(site.linkPattern)) links.add(new URL(m[1], site.base).href);
  }

  // Saltea las que ya vimos (como sugerencia o ya cargadas a mano)
  const fresh = [];
  for (const link of links) {
    const seen = await env.DB
      .prepare('SELECT 1 FROM suggestions WHERE url = ? UNION SELECT 1 FROM apartments WHERE url = ?')
      .bind(link, link).first();
    if (!seen) fresh.push(link);
    if (fresh.length >= MAX_NEW_PER_SOURCE) break;
  }

  let added = 0;
  let skipped = 0;
  for (const link of fresh) {
    const p = await previewListing(link);
    if (p.error) {
      errors.push(p.error);
      continue;
    }
    const discard =
      (criteria.requirePileta && p.pileta === 0) ||
      (criteria.maxPrice && p.price && (p.currency || 'ARS') === criteria.currency && p.price > criteria.maxPrice);
    // Las descartadas igual se guardan para no volver a abrirlas en la próxima corrida
    await env.DB.prepare(
      `INSERT OR IGNORE INTO suggestions
        (url, source, title, barrio, address, photo_url, price, currency, expensas, ambientes, dormitorios,
         banos, m2_cubiertos, m2_totales, pileta, mascotas, cochera, balcon, amenities, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      p.url || link, source, p.title ?? null, p.barrio ?? null, p.address ?? null, p.photo_url ?? null,
      p.price ?? null, p.currency ?? null, p.expensas ?? null, p.ambientes ?? null, p.dormitorios ?? null,
      p.banos ?? null, p.m2_cubiertos ?? null, p.m2_totales ?? null, p.pileta ?? null, p.mascotas ?? null,
      p.cochera ?? null, p.balcon ?? null, p.amenities ?? null, discard ? 'filtrada' : 'nueva',
    ).run();
    if (discard) skipped++;
    else added++;
  }
  return { found: links.size, added, skipped, errors: [...new Set(errors)].slice(0, 3) };
}

const BROWSER_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36',
  'Accept-Language': 'es-AR,es;q=0.9',
  Accept: 'text/html',
};
