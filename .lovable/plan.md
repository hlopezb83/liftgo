## Problema

El warning viene de `actions/cache@v4`, que declara `runs.using: node20` en su `action.yml`. GitHub lo fuerza a Node 24 (por nuestro override), pero sigue emitiendo el deprecation notice hasta que la acción publique una versión que declare `node24`.

Tenemos 4 usos:
- `.github/actions/setup-bun-project/action.yml:29`
- `.github/workflows/bundle-size.yml:49`
- `.github/workflows/ci.yml:252`
- `.github/workflows/ci.yml:332`

## Plan

1. Verificar el último release de `actions/cache` que ya declara `node24` (esperado: `v5` o un `v4.x` reciente). Ejecutar `curl -s https://api.github.com/repos/actions/cache/releases | jq '.[0:5].[].tag_name'` y leer el `action.yml` del tag más nuevo para confirmar `runs.using: node24`.
2. Si existe un tag con `node24`, actualizar los 4 usos de `actions/cache@v4` a esa versión (major flotante, ej. `@v5`, siguiendo la convención existente del repo).
3. Si **no** existe todavía una versión con `node24`, no cambiar nada y documentar en el reply que el warning es informativo y desaparecerá cuando `actions/cache` publique soporte oficial de Node 24 (no lo podemos arreglar nosotros).
4. Bump changelog a **v7.224.7** con la nota del upgrade (o registrar la investigación si no hay versión disponible).

## Detalles técnicos

- No tocar la lógica de cache keys ni paths.
- Mantener el pin del composite action `setup-bun-project` como fuente única de la versión Node.
- No requiere cambios en Bun ni en el lockfile.
