# Subir las GitHub Actions oficiales a su última major

Solo se tocan las actions mantenidas por GitHub, que son las que se pueden subir con riesgo bajo. Las de terceros ya están fijadas por SHA y las mantiene Dependabot.

## Qué se sube

| Action | Ahora | Destino | Dónde |
|---|---|---|---|
| `actions/checkout` | v6 | v7 | 20 usos en 8 workflows |
| `actions/setup-node` | v5 | v7 | `.github/actions/setup-bun-project` |
| `actions/download-artifact` | v6 | v8 | 2 usos en `ci.yml` |
| `actions/upload-artifact` | v7 | v7 (ya al día) | sin cambio |
| `actions/cache` (+ `/save`, `/restore`) | v6 | v6 (ya al día) | sin cambio |
| `github/codeql-action` | v4 | v4 (ya al día) | sin cambio |

## Por qué es seguro

- `checkout` v7: mismo API de entradas; endurece el manejo de credenciales en PRs de forks (protección "pwn request"). No cambia rutas ni comportamiento de clonado para nuestros usos.
- `download-artifact` v8: requiere `upload-artifact` v6+ para leer los artefactos; ya estamos en v7, así que la pareja queda compatible.
- `setup-node` v7: corre sobre Node 24 (el mismo runtime que ya fija la matriz del CI) y conserva las entradas `node-version` y `cache` que usamos.

## Cómo se valida

1. Actualizar las referencias `@vN` en los 8 workflows y en la acción compuesta `setup-bun-project`.
2. Pasar `actionlint` (ya corre en `ci.yml`) para detectar entradas inválidas.
3. Confirmar en la siguiente corrida de CI que: descarga de artefactos de cobertura y de reportes Playwright funciona, la caché de bun sigue con hit, y CodeQL/gitleaks/lighthouse siguen verdes.
4. Si `download-artifact@v8` fallara por nombre/patrón de artefacto, se revierte solo ese paso a v6 y se deja el resto subido.

## Changelog

Entrada nueva al inicio de `public/changelog.json` y `CHANGELOG.md` como versión **patch** (mantenimiento de CI, sin cambio funcional en la app).
