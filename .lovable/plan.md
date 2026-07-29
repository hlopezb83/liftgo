## Qué pasa

El log de Release Drafter no es un error: el action funcionó y actualizó el borrador. El problema es la versión que resuelve.

Dice literalmente: *"No published release found"* y *"last release: none"*. Release Drafter calcula la versión sumando el incremento (patch) sobre el último **release publicado en GitHub**. Como el repo no tiene ninguno publicado, arranca desde cero: `0.0.0 + patch = 0.0.1`.

Analogía: el odómetro del coche está en 7,256 km, pero le pusimos un contador nuevo que empieza en 0 y ahora marca 1 km.

Además, al revisar el repo encontré una desincronía real de versiones:

| Archivo | Versión |
|---|---|
| `package.json` | 7.253.4 |
| `public/version.json` | 7.256.0 |
| `public/changelog.json[0]` | 7.256.1 |

El job `version-sync` de `changelog-check.yml` exige que las tres coincidan, así que cualquier PR que toque esos archivos fallará hasta corregirlo.

## Plan

### 1. Sincronizar las tres versiones (bloqueante)
- Subir `package.json` a `7.256.1`.
- Regenerar `public/version.json` con `node scripts/gen-version.mjs` (lo deriva del changelog).
- Verificar que exista `public/changelog/v7.256.1.json` (ya existe) y correr el job de validación localmente.

### 2. Que Release Drafter respete la versión real del proyecto
Opción recomendada: pasarle la versión explícita desde `package.json`, para que deje de inventar `0.0.x` y el borrador siempre se llame igual que el changelog.

En `.github/workflows/release-drafter.yml`:
- Añadir `actions/checkout@v6` antes del action.
- Leer la versión con un paso de shell (`node -p "require('./package.json').version"`) y exponerla como output.
- Pasar `version: ${{ steps.pkg.outputs.version }}` al action.

Resultado: el borrador pasa a llamarse `v7.256.1` y se actualiza solo con cada push a `main`.

### 3. Publicar un release base (una sola vez)
Aunque con el paso 2 ya no es imprescindible, publicar el borrador `v7.256.1` en GitHub deja un "último release publicado" real, lo que además arregla las notas de cambios (hoy el body sólo puede listar commits sin punto de comparación). Esto lo haces tú desde la pestaña Releases; te dejo las instrucciones exactas.

### 4. Guardia opcional en CI
Añadir al job `version-sync` una comprobación de que el tag del último release publicado no quede por detrás del changelog, para que esta deriva no vuelva a pasar silenciosamente.

## Detalles técnicos

- El input `version` de release-drafter tiene precedencia sobre `RESOLVED_VERSION` calculado, así que anula el `version-resolver.default: patch`.
- `gen-version.mjs` deriva `version.json` del changelog, no de `package.json`; por eso `package.json` se puede quedar atrás y hay que actualizarlo a mano (o añadir ese paso al script — te lo puedo incluir si lo prefieres).
- El paso 4 requiere `permissions: contents: read` y una llamada a la API de releases; se puede hacer con `gh release view --json tagName`.

## Fuera de alcance
- No toco el contenido del changelog ni la numeración histórica.
- No automatizo la publicación del release (queda manual y deliberada).
