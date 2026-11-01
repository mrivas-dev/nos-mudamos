# Nos mudamos

Web simple y mobile-first para llevar la lista de departamentos que estamos viendo.

- **Acceso por dispositivo:** la primera vez cada celular o notebook ingresa un código compartido y queda recordado (cookie de ~13 meses). Desde ⚙️ se ven los dispositivos autorizados y se puede quitar uno.
- **Lista:** agregar, editar, puntuar y cambiar el estado de cada departamento (nuevo, contactado, visita, favorito, descartado). Al pegar un link de Zonaprop, Argenprop o MercadoLibre se intenta completar los datos solo.
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

Se publica solo con GitHub Actions en cada push a `main` (`.github/workflows/deploy.yml`). Necesita estos secrets en el repo (Settings → Secrets and variables → Actions):

- `CLOUDFLARE_API_TOKEN`: token de Cloudflare con la plantilla "Edit Cloudflare Workers" más permiso de edición de D1.
- `CLOUDFLARE_ACCOUNT_ID`: el id de la cuenta de Cloudflare.
- `ACCESS_CODE`: el código para autorizar dispositivos.

La primera vez el workflow crea la base D1. La web queda en `https://nos-mudamos.<subdominio>.workers.dev`.
