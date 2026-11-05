# Nos mudamos v2

Web simple, pública y pensada para el celular, para llevar la lista de departamentos que estamos viendo.

> La versión 1 quedó guardada en la rama `v1-archivo`. La web de la v1 sigue online hasta que la v2 se publique en su lugar.

## Estado

Primera versión de la v2: lista de departamentos con el diseño nuevo, leyendo y escribiendo la hoja "Dptos" y guardando en D1 los datos de cada aviso (precio y foto). Falta publicarla: crear la base D1, cargar los secretos de Google y compartirle la hoja a la cuenta de servicio. Todavía no hay deploy automático. Detalles en [`AGENTS.md`](AGENTS.md).

## Cómo trabajamos

El código se escribe con Cursor y con Claude Code. Las reglas para ambos están en [`AGENTS.md`](AGENTS.md) (Claude las lee desde `CLAUDE.md` y Cursor desde `.cursor/rules/`).
