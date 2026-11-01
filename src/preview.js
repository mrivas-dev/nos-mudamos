// Lee una publicación de Zonaprop, Argenprop o MercadoLibre y saca los datos que pueda.
// Es "mejor esfuerzo": si el sitio cambia o bloquea la consulta, se completa a mano.

const SOURCES = {
  zonaprop: /(^|\.)zonaprop\.com\.ar$/,
  argenprop: /(^|\.)argenprop\.com$/,
  mercadolibre: /(^|\.)mercadolibre\.com\.ar$/,
};

export function sourceFromUrl(raw) {
  try {
    const host = new URL(raw).hostname;
    for (const [name, re] of Object.entries(SOURCES)) if (re.test(host)) return name;
  } catch {}
  return 'otro';
}

export async function previewListing(raw) {
  let url;
  try {
    url = new URL(raw);
  } catch {
    return { error: 'Link inválido' };
  }
  const source = sourceFromUrl(url.href);
  // Solo consultamos los sitios conocidos, nunca una dirección cualquiera
  if (source === 'otro' || url.protocol !== 'https:') {
    return { source, error: 'Solo se pueden autocompletar links de Zonaprop, Argenprop o MercadoLibre' };
  }
  url.search = ''; // los parámetros de seguimiento no hacen falta
  let html;
  try {
    const res = await fetch(url.href, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36',
        'Accept-Language': 'es-AR,es;q=0.9',
        Accept: 'text/html',
      },
      redirect: 'follow',
    });
    if (!res.ok) return { source, url: url.href, error: `El sitio respondió ${res.status}` };
    html = (await res.text()).slice(0, 3_000_000);
  } catch {
    return { source, url: url.href, error: 'No se pudo abrir la publicación' };
  }
  return { source, url: url.href, ...parseListing(html) };
}

export function parseListing(html) {
  const out = {};
  const meta = (prop) => {
    const re = new RegExp(
      `<meta[^>]+(?:property|name)=["']${prop}["'][^>]*content=["']([^"']*)["']|<meta[^>]+content=["']([^"']*)["'][^>]*(?:property|name)=["']${prop}["']`,
      'i',
    );
    const m = html.match(re);
    return m ? decode(m[1] ?? m[2]) : null;
  };

  out.title = meta('og:title') || decode(html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1] || '') || null;
  out.photo_url = meta('og:image');
  const description = meta('og:description') || meta('description') || '';

  // Datos estructurados (schema.org), si los hay
  for (const m of html.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      for (const node of flatten(JSON.parse(m[1]))) fromJsonLd(node, out);
    } catch {}
  }

  // Solo usamos título y descripción: el resto de la página trae menús y avisos
  // relacionados que darían falsos positivos (por ejemplo "pileta" en un filtro).
  const all = `${out.title || ''} . ${description} . ${out._ldDescription || ''}`;
  delete out._ldDescription;

  const num = (re) => {
    const m = all.match(re);
    return m ? toInt(m[1]) : null;
  };
  out.ambientes ??= num(/(\d{1,2})\s*amb(?:ientes?|\.)?\b/i);
  out.dormitorios ??= num(/(\d{1,2})\s*dorm(?:itorios?|\.)?\b/i);
  out.banos ??= num(/(\d{1,2})\s*baños?\b/i);
  out.m2_cubiertos ??= num(/(\d{2,4})\s*m(?:²|2)\s*cub/i);
  out.m2_totales ??= num(/(\d{2,4})\s*m(?:²|2)\s*tot/i);
  out.antiguedad ??= num(/(\d{1,3})\s*años?\s*(?:de\s*)?antig/i) ?? num(/antig[üu]edad:?\s*(\d{1,3})/i);
  out.expensas ??= num(/expensas:?\s*\$\s*([\d.]+)/i) ?? num(/\$\s*([\d.]+)\s*expensas/i);

  if (out.price == null) {
    const m = all.match(/(?:alquiler|precio)?\s*(USD|U\$S|US\$|\$)\s*([\d.]{4,})/i);
    if (m) {
      out.currency = /^\$$/.test(m[1]) ? 'ARS' : 'USD';
      out.price = toInt(m[2]);
    }
  }

  const has = (re) => (re.test(all) ? 1 : null);
  out.pileta ??= has(/\bpileta|\bpiscina/i);
  out.cochera ??= has(/\bcocheras?\b(?!\s*:?\s*no\b)/i);
  out.balcon ??= has(/\bbalc[oó]n|\bterraza/i);
  if (/no\s+(?:se\s+)?(?:acepta|permite)n?\s+mascotas|sin\s+mascotas/i.test(all)) out.mascotas = 0;
  else if (/(?:acepta|permite)n?\s+mascotas|apto\s+mascotas|pet\s*friendly/i.test(all)) out.mascotas = 1;

  const amenities = ['gimnasio', 'gym', 'sum', 'parrilla', 'solarium', 'laundry', 'seguridad', 'vigilancia', 'sauna', 'jacuzzi']
    .filter((a) => new RegExp(`\\b${a}\\b`, 'i').test(all));
  if (amenities.length) out.amenities = [...new Set(amenities.map((a) => (a === 'gym' ? 'gimnasio' : a)))].join(', ');

  if (!out.barrio) {
    const m = all.match(/\b(Palermo(?:\s+(?:Soho|Hollywood|Chico|Nuevo|Viejo))?|Belgrano|Colegiales|Villa Crespo|Recoleta|Núñez|Nuñez|Caballito|Almagro)\b/);
    if (m) out.barrio = m[1];
  }

  for (const k of Object.keys(out)) if (out[k] == null || out[k] === '') delete out[k];
  return out;
}

function fromJsonLd(node, out) {
  if (!node || typeof node !== 'object') return;
  const offer = Array.isArray(node.offers) ? node.offers[0] : node.offers;
  if (offer?.price && out.price == null) {
    out.price = toInt(offer.price);
    out.currency = /USD/i.test(offer.priceCurrency || '') ? 'USD' : 'ARS';
  }
  if (node.numberOfRooms && out.ambientes == null) out.ambientes = toInt(node.numberOfRooms?.value ?? node.numberOfRooms);
  if (node.numberOfBedrooms && out.dormitorios == null) out.dormitorios = toInt(node.numberOfBedrooms);
  if (node.numberOfBathroomsTotal && out.banos == null) out.banos = toInt(node.numberOfBathroomsTotal);
  if (node.floorSize && out.m2_cubiertos == null) out.m2_cubiertos = toInt(node.floorSize?.value ?? node.floorSize);
  const addr = node.address;
  if (addr && typeof addr === 'object') {
    if (addr.streetAddress && !out.address) out.address = String(addr.streetAddress);
    if (addr.addressLocality && !out.barrio) out.barrio = String(addr.addressLocality);
  }
  if (typeof node.description === 'string') out._ldDescription = decode(node.description);
  if (node.image && !out.photo_url) out.photo_url = [].concat(node.image)[0]?.url ?? [].concat(node.image)[0];
}

function flatten(data) {
  const list = Array.isArray(data) ? data : [data];
  return list.flatMap((n) => (n && n['@graph'] ? flatten(n['@graph']) : [n]));
}

function toInt(v) {
  const n = Number(String(v).replace(/[.\s]/g, '').replace(',', '.'));
  return Number.isFinite(n) ? Math.round(n) : null;
}

function decode(s) {
  return s
    .replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;|&#039;/g, "'")
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, c) => String.fromCharCode(Number(c)))
    .replace(/&([a-z])acute;/gi, (_, c) => ({ a: 'á', e: 'é', i: 'í', o: 'ó', u: 'ú' })[c.toLowerCase()] || c)
    .replace(/&ntilde;/gi, 'ñ').replace(/&sup2;/g, '²')
    .trim();
}
