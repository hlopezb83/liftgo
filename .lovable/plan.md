## Objetivo
Eliminar los warnings de deprecación de Node.js 20 en CI actualizando las GitHub Actions a sus versiones más recientes que ya corren nativamente en Node.js 24.

## Cambios en `.github/workflows/ci.yml`

1. **`actions/upload-artifact@v5` → `@v7`** (8 ocurrencias: líneas 55, 95, 122, 165, 174, 183 y las restantes). v7.0.1 (abril 2026) corre en Node.js 24 nativo.
2. **`mikepenz/action-junit-report@v5` → `@v6`** (líneas 64, 192). v6 ya soporta Node 24.
3. **Eliminar `FORCE_JAVASCRIPT_ACTIONS_TO_NODE24: true`** del bloque `env` del workflow: deja de ser necesario una vez que todas las actions usen Node 24 nativo.
4. **No tocar** las que ya están al día:
   - `actions/checkout@v5` (última estable)
   - `oven-sh/setup-bun@v2` (última)
   - `denoland/setup-deno@v2` (última)

## Changelog

Agregar `v6.42.7` (patch):
- `public/changelog/v6.42.7.json` con detalle de los bumps.
- Entrada nueva al inicio del array en `public/changelog.json`.

## Validación
El push a la rama disparará el CI; revisaremos que desaparezcan los avisos de Node 20 y que todos los jobs (Lint/Knip/Tests/Build, E2E shards, Edge Functions) sigan en verde.
