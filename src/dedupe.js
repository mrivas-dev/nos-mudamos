// Detecta departamentos repetidos: el mismo aviso con distinto link, o el mismo
// departamento publicado en otro sitio o por otra inmobiliaria.

// Identificador del aviso dentro de su sitio (ignora el texto del link y los parámetros)
export function listingKey(url) {
  if (!url) return null;
  let u;
  try {
    u = new URL(url);
  } catch {
    return url;
  }
  const host = u.hostname;
  let m;
  if (/zonaprop\.com\.ar$/.test(host) && (m = u.pathname.match(/-(\d{6,})\.html$/))) return `zonaprop:${m[1]}`;
  if (/argenprop\.com$/.test(host) && (m = u.pathname.match(/--(\d{6,})$/))) return `argenprop:${m[1]}`;
  if (/mercadolibre\.com\.ar$/.test(host) && (m = u.pathname.match(/MLA-?(\d+)/i))) return `mercadolibre:${m[1]}`;
  return `${host}${u.pathname.replace(/\/+$/, '')}`;
}

const normalize = (s) =>
  String(s)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\b(av|avenida|calle|al|n|nro|numero)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

// "Huella" del departamento: calle y altura, o si no hay dirección, precio + m² + ambientes
export function fingerprint(item) {
  if (item.address) {
    const m = normalize(item.address).match(/([a-z][a-z ]*?) (\d{2,5})\b/);
    if (m) return `dir:${m[1]} ${m[2]}|${item.ambientes ?? ''}`;
  }
  const m2 = item.m2_cubiertos || item.m2_totales;
  if (item.price && m2 && item.ambientes) return `dat:${item.currency || 'ARS'}${item.price}|${m2}|${item.ambientes}`;
  return null;
}

// Deja la primera aparición de cada departamento y saca los que ya están en nuestra lista
export function uniqueSuggestions(suggestions, apartments) {
  const seen = new Set();
  for (const a of apartments) {
    const k = listingKey(a.url);
    const f = fingerprint(a);
    if (k) seen.add(k);
    if (f) seen.add(f);
  }
  const out = [];
  for (const s of suggestions) {
    const k = listingKey(s.url);
    const f = fingerprint(s);
    if ((k && seen.has(k)) || (f && seen.has(f))) continue;
    if (k) seen.add(k);
    if (f) seen.add(f);
    out.push(s);
  }
  return out;
}
