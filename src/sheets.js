// Cliente mínimo de Google Sheets con cuenta de servicio (sin dependencias).
const SCOPE = 'https://www.googleapis.com/auth/spreadsheets';

const b64url = (buf) =>
  btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

async function token(env) {
  const now = Math.floor(Date.now() / 1000);
  const enc = (o) => b64url(new TextEncoder().encode(JSON.stringify(o)));
  const unsigned = `${enc({ alg: 'RS256', typ: 'JWT' })}.${enc({
    iss: env.GOOGLE_CLIENT_EMAIL, scope: SCOPE, aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600,
  })}`;
  const pem = env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n').replace(/-----[^-]+-----|\s/g, '');
  const der = Uint8Array.from(atob(pem), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey('pkcs8', der, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(unsigned));
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${unsigned}.${b64url(sig)}` }),
  });
  if (!r.ok) throw new Error(`Google auth ${r.status}`);
  return (await r.json()).access_token;
}

async function call(env, path, init = {}) {
  const r = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${env.SHEET_ID}${path}`, {
    ...init,
    headers: { authorization: `Bearer ${await token(env)}`, 'content-type': 'application/json' },
  });
  if (!r.ok) throw new Error(`Sheets ${r.status}: ${await r.text()}`);
  return r.json();
}

const bool = (v) => String(v).toUpperCase() === 'TRUE';
export const COLUMNAS = { contactado: 'B', respondio: 'C', visita: 'D', notas: 'E' };

// Devuelve [{fila, url, contactado, respondio, visita, notas}] (fila = número real en la hoja).
export async function leerFilas(env) {
  const tab = encodeURIComponent(env.SHEET_TAB);
  const { values = [] } = await call(env, `/values/${tab}!A2:E?valueRenderOption=FORMATTED_VALUE`);
  return values
    .map((f, i) => ({
      fila: i + 2, url: (f[0] || '').trim(), contactado: bool(f[1]), respondio: bool(f[2]), visita: f[3] || '', notas: f[4] || '',
    }))
    .filter((f) => f.url);
}

export async function actualizarCampo(env, fila, campo, valor) {
  const col = COLUMNAS[campo];
  if (!col) throw new Error('Campo inválido');
  const v = typeof valor === 'boolean' ? (valor ? 'TRUE' : 'FALSE') : String(valor ?? '');
  const rango = encodeURIComponent(`${env.SHEET_TAB}!${col}${fila}`);
  await call(env, `/values/${rango}?valueInputOption=USER_ENTERED`, { method: 'PUT', body: JSON.stringify({ values: [[v]] }) });
}

export async function agregarUrl(env, url) {
  const rango = encodeURIComponent(`${env.SHEET_TAB}!A:E`);
  await call(env, `/values/${rango}:append?valueInputOption=USER_ENTERED`, {
    method: 'POST', body: JSON.stringify({ values: [[url, 'FALSE', 'FALSE', '', '']] }),
  });
}
