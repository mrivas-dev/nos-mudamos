# Reglas del proyecto

Estas reglas valen para cualquier asistente que trabaje en este repo (Claude Code, Cursor u otro).

## El proyecto

- Nos mudamos v2: web para que una pareja lleve la lista de departamentos candidatos para alquilar.
- Se usa sobre todo desde el celular: diseñar mobile-first.
- Idioma: todo lo que ve el usuario, los commits y los PR van en español.

## Cómo trabajar

- Cambios chicos y enfocados, un tema por PR.
- No pushear directo a `main`: trabajar en una rama y abrir un PR.
- No subir secretos (`.env`, `.dev.vars`, tokens). Usar archivos `*.example` como plantilla.
- Antes de agregar una dependencia, preferir lo simple y lo que ya está en el proyecto.
- Si se agrega deploy automático a `main`, documentarlo acá y en el README.

## Stack

- Cloudflare Worker (JavaScript, sin framework) + D1 + front HTML/CSS/JS plano en `public/`. Diseño base: https://claude.ai/artifact/Jd7aH5roqVdpUQWvEXeCsU
- La Google Spreadsheet "Dptos" es la fuente de verdad de lo nuestro (URL, Contactado, Respondio, Visita, Notas). Se lee y escribe con la API de Google usando una cuenta de servicio (`src/sheets.js`).
- D1 (`schema.sql`) guarda lo que se saca de cada aviso: título, barrio, precio, expensas y foto (`src/scrape.js`). Zonaprop bloquea pedidos automáticos: ahí se carga a mano.
- Secretos (con `wrangler secret put`, o en `.dev.vars` local; plantilla en `.dev.vars.example`): `GOOGLE_CLIENT_EMAIL`, `GOOGLE_PRIVATE_KEY`, opcional `ACCESS_CODE`.
- Correr local: `npm install` y `npm run dev`. Tests: `npm test`. Publicar: `npm run deploy` (todavía no hay deploy automático).
