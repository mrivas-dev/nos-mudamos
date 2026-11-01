# Nos mudamos

Web simple y mobile-first para llevar la lista de departamentos que estamos viendo.

- **Acceso por dispositivo:** la primera vez cada celular o notebook ingresa un código compartido y queda recordado (cookie de ~13 meses). Desde ⚙️ se ven los dispositivos autorizados y se puede quitar uno.
- **Lista:** agregar, editar, puntuar y cambiar el estado de cada departamento (nuevo, contactado, visita, favorito, descartado).
- **Próximamente:** sugerencias automáticas desde Zonaprop, Argenprop y MercadoLibre.

## Stack

Cloudflare Workers (API + archivos estáticos) y D1 (SQLite). Sin frameworks: HTML, CSS y JS plano en `public/`.

## Desarrollo local

```sh
npm install
cp .dev.vars.example .dev.vars   # y poner un ACCESS_CODE
npm run db:migrate:local
npm run dev                      # http://localhost:8787
```

## Publicar

```sh
npx wrangler login
npx wrangler d1 create nos-mudamos   # copiar el database_id a wrangler.toml
npm run db:migrate:remote
npx wrangler secret put ACCESS_CODE
npm run deploy
```
