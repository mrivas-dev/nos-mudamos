// Saca título, precio, barrio y foto de un aviso. Usa las etiquetas og:/JSON-LD,
// que comparten casi todos los portales. Zonaprop bloquea pedidos automáticos (403):
// ahí se devuelve error y los datos se cargan a mano.
const UA = 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/124 Mobile Safari/537.36';

export function fuenteDe(url) {
  const h = new URL(url).hostname;
  if (h.includes('mercadolibre')) return 'MercadoLibre';
  if (h.includes('zonaprop')) return 'Zonaprop';
  if (h.includes('argenprop')) return 'Argenprop';
  return h.replace(/^www\./, '');
}

const decode = (s) =>
  s.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;|&#x27;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>');

function meta(html, clave) {
  const re = new RegExp(`<meta[^>]+(?:property|name|itemprop)=["']${clave}["'][^>]*>`, 'i');
  const tag = html.match(re)?.[0];
  const c = tag?.match(/content=["']([^"']*)["']/i)?.[1];
  return c ? decode(c) : null;
}

function jsonLd(html) {
  const out = [];
  for (const m of html.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
    try { out.push(JSON.parse(m[1])); } catch { /* ignorar */ }
  }
  return out.flat();
}

export function parsear(html, url) {
  const ld = jsonLd(html);
  const offer = ld.map((o) => o?.offers).find(Boolean);
  const o = Array.isArray(offer) ? offer[0] : offer;
  const precio = Number(meta(html, 'price') ?? meta(html, 'product:price:amount') ?? o?.price ?? o?.lowPrice) || null;
  const moneda = meta(html, 'priceCurrency') ?? meta(html, 'product:price:currency') ?? o?.priceCurrency ?? null;
  const titulo = meta(html, 'og:title') ?? decode(html.match(/<title>([^<]*)<\/title>/i)?.[1] ?? '');
  const desc = meta(html, 'og:description') ?? '';
  const ambientes = Number((titulo + ' ' + desc).match(/(\d+)\s*amb/i)?.[1]) || null;
  const barrio = (titulo + ' ' + desc).match(/\b(Palermo(?: [A-Z][a-z]+)?|Belgrano|Recoleta|Villa Crespo|Colegiales|N[uú]ñez)\b/)?.[1] ?? null;
  return { fuente: fuenteDe(url), titulo: titulo || null, barrio, ambientes, precio, moneda, foto: meta(html, 'og:image'), expensas: null };
}

export async function leerAviso(url) {
  const r = await fetch(url, { headers: { 'user-agent': UA, 'accept-language': 'es-AR,es;q=0.9' }, redirect: 'follow' });
  if (!r.ok) throw new Error(`El sitio respondió ${r.status}`);
  return parsear(await r.text(), url);
}
