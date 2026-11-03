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
  return { source, url: url.href, ...parseListing(html, source) };
}

export function parseListing(html, source) {
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

  // Cada sitio tiene una ficha con datos ordenados: esos valen más que lo que se adivina del texto
  const site = SITE_PARSERS[source];
  if (site) {
    const text = pageText(html);
    for (const [k, v] of Object.entries(site(text, html))) if (v != null && v !== '') out[k] = v;
  }
  if (out.title) out.title = out.title.replace(/\s*[|-]\s*(Argenprop|MercadoLibre|Zonaprop).*$/i, '').replace(/\s+-\s+(US\$|\$)\s*[\d.]+$/, '').trim();

  for (const k of Object.keys(out)) if (out[k] == null || out[k] === '') delete out[k];
  return out;
}

function pageText(html) {
  return decode(html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ');
}

const pick = (text, re) => text.match(re)?.[1] ?? null;
const pickInt = (text, re) => {
  const v = pick(text, re);
  return v == null ? null : toInt(v);
};
const yesNo = (v) => (v == null ? null : /^s[ií]/i.test(v) ? 1 : /^no/i.test(v) ? 0 : null);

const SITE_PARSERS = {
  // Ficha "Características ... Código de aviso"
  argenprop(text) {
    const a = text.indexOf('Características');
    const b = text.indexOf('Código de aviso', a);
    if (a < 0) return {};
    const t = text.slice(a, b > a ? b : a + 4000);
    const out = {
      ambientes: pickInt(t, /Cant\. Ambientes: (\d+)/),
      dormitorios: pickInt(t, /Cant\. Dormitorios: (\d+)/),
      banos: pickInt(t, /Cant\. Baños: (\d+)/),
      antiguedad: pickInt(t, /Antig[üu]edad: (\d+)/i),
      expensas: pickInt(t, /Expensas: \$ ?([\d.]+)/),
      m2_cubiertos: pickInt(t, /Sup\. Cubierta: (\d+)/),
      m2_totales: pickInt(t, /Sup\. Total: (\d+)/),
    };
    const cocheras = pickInt(t, /Cant\. Cocheras: (\d+)/);
    if (cocheras != null) out.cochera = cocheras > 0 ? 1 : 0;
    const price = t.match(/Precio: (USD|U\$S|\$) ?([\d.]+)/);
    if (price) {
      out.price = toInt(price[2]);
      out.currency = price[1] === '$' ? 'ARS' : 'USD';
    }
    // La ficha lista las instalaciones del edificio: si no nombra pileta, no tiene
    out.pileta = /\bPileta\b/i.test(t) ? 1 : 0;
    if (/\b(Balc[oó]n|Terraza)\b/i.test(t)) out.balcon = 1;
    if (/(Permite|Acepta|Apto) mascotas/i.test(t)) out.mascotas = 1;
    const amen = ['Gimnasio', 'SUM', 'Parrilla', 'Solarium', 'Laundry', 'Vigilancia', 'Sauna', 'Jacuzzi'].filter((x) =>
      new RegExp(`\\b${x}\\b`).test(t),
    );
    if (amen.length) out.amenities = amen.join(', ').toLowerCase();
    return out;
  },

  // Ficha "Características del inmueble" con pares "Etiqueta valor"
  mercadolibre(text, html) {
    const a = text.indexOf('Características del inmueble');
    if (a < 0) return {};
    const t = text.slice(a, a + 6000);
    const out = {
      m2_totales: pickInt(t, /Superficie total (\d+)/),
      m2_cubiertos: pickInt(t, /Superficie cubierta (\d+)/),
      ambientes: pickInt(t, /\bAmbientes (\d+)/),
      dormitorios: pickInt(t, /\bDormitorios (\d+)/),
      banos: pickInt(t, /\bBaños (\d+)/),
      antiguedad: pickInt(t, /Antigüedad (\d+)/),
      expensas: pickInt(t, /Expensas ([\d.]+) ARS/),
      piso: pick(t, /Número de piso de la unidad (\w+)/),
      mascotas: yesNo(pick(t, /Admite mascotas:? (Sí|No)/)),
      pileta: yesNo(pick(t, /\bPileta (Sí|No)/)),
    };
    const cocheras = pickInt(t, /\bCocheras:? (\d+)/);
    if (cocheras != null) out.cochera = cocheras > 0 ? 1 : 0;
    const balcon = yesNo(pick(t, /\bBalcón (Sí|No)/));
    const terraza = yesNo(pick(t, /\bTerraza (Sí|No)/));
    if (balcon === 1 || terraza === 1) out.balcon = 1;
    else if (balcon === 0 && terraza !== 1) out.balcon = 0;
    const amen = ['Gimnasio', 'Parrilla', 'Solarium', 'Laundry', 'Sauna', 'Jacuzzi', 'Seguridad']
      .filter((x) => new RegExp(`\\b${x}:? Sí`).test(t));
    if (/Salón de usos múltiples:? Sí/.test(t)) amen.push('SUM');
    if (amen.length) out.amenities = amen.join(', ').toLowerCase();
    // La dirección viene en los datos de la página, en el link a la ubicación
    const loc = html.match(/"target":"location_and_points"[^{}]*"label":\{"text":"([^"]{3,120})"/);
    if (loc) out.address = decodeJsonString(loc[1]).replace(/,\s*(Capital Federal|CABA).*$/i, '').trim();
    return out;
  },
};

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
    // Argenprop pone el barrio en addressRegion y "CABA, Argentina" en addressLocality
    const barrio = [addr.addressRegion, addr.addressLocality].find((v) => v && !/CABA|Capital|Argentina/i.test(v));
    if (barrio && !out.barrio) out.barrio = String(barrio);
    const piso = String(addr.streetAddress || '').match(/Piso (\w+)/i);
    if (piso && !out.piso) out.piso = piso[1];
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
    .replace(/&#x([0-9a-f]+);/gi, (_, c) => String.fromCharCode(parseInt(c, 16)))
    .replace(/&plus;/g, '+')
    .replace(/&([a-z])acute;/gi, (_, c) => ({ a: 'á', e: 'é', i: 'í', o: 'ó', u: 'ú' })[c.toLowerCase()] || c)
    .replace(/&ntilde;/gi, 'ñ').replace(/&sup2;/g, '²')
    .trim();
}

function decodeJsonString(v) {
  try {
    return JSON.parse(`"${v}"`);
  } catch {
    return v;
  }
}
