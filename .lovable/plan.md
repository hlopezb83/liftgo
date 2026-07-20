## Problema

`public/changelog.json` tiene una entrada sin `version` (índice 3, la de "Sprint ESLint Ola 1"), lo que rompe la validación en `src/features/changelog/lib/changelog.ts` y lanza `"Entrada #N: versión inválida"` en toda la app al montar el hook de changelog. También quedaron desordenadas las últimas versiones (7.114.5, 7.114.3, 7.114.4 en vez de descendente).

## Cambios

1. **`public/changelog.json`** — agregar `version: "7.114.2"` a la entrada del índice 3 (Ola 1 de ESLint), que es la versión correcta según la secuencia (7.114.1 → 7.114.2 → 7.114.3 → 7.114.4 → 7.114.5). Reordenar las 3 entradas superiores para dejar el orden descendente correcto: 7.114.5 → 7.114.4 → 7.114.3 → 7.114.2 → 7.114.1.

2. **`public/changelog/v7.114.2.json`** — crear el detalle correspondiente (si no existe) con el resumen que ya vive en la entrada del índice.

3. **`public/changelog.json`** + **`public/changelog/v7.114.6.json`** — agregar entrada v7.114.6 (patch) documentando el fix.

## Detalles técnicos

- Validador: `parseIndexEntry` en `src/features/changelog/lib/changelog.ts:29` exige `typeof version === "string"` que pase `/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/`.
- El `#N` en el error es 0-indexed y varía entre bundle publicado y bundle preview porque el archivo se sirve estático desde `public/`.
- No hay cambios de código de la app: sólo datos en `public/`.

## Verificación

- `python3 -c "import json; [ ...validar cada entry... ]"` para confirmar que todas tienen `version` válido tras el fix.
- Cargar la ruta `/changelog` en el preview y verificar que ya no aparece el error.
