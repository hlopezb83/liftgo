## Objetivo
Forzar que todos los GitHub Actions corran con Node.js 24.

## Contexto
- Ningún workflow usa `actions/setup-node` hoy; se apoyan en el Node que trae por defecto el runner `ubuntu-latest` (Node 20 actualmente) más `oven-sh/setup-bun`.
- Todos los workflows que necesitan Node/Bun pasan por la composite action `.github/actions/setup-bun-project/action.yml`.

## Cambio
Editar `.github/actions/setup-bun-project/action.yml`:

1. Añadir un input opcional `node-version` (default `"24"`).
2. Insertar un paso `actions/setup-node@v4` **antes** de `Setup Bun` con `node-version: ${{ inputs.node-version }}`.
3. Extender la `key` del cache de Bun para incluir `node-${{ inputs.node-version }}` y evitar reutilizar caches viejos.

Con esto, los 9 workflows que usan la composite (`ci.yml`, `bundle-size.yml`, `changelog-check.yml`, `supabase-lint.yml`, etc.) obtienen Node 24 sin tocar cada archivo.

## Fuera de alcance
- No se cambia la versión de Bun ni de Deno.
- No se modifica `package.json` `engines` (se puede agregar si lo pides).

## Changelog
Entrada `patch` v7.224.5 — "CI: forzar Node.js 24 en workflows vía setup-bun-project".
