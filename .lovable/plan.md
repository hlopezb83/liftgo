## Objetivo

Generar un **reporte de auditoría dependencias vs helpers internos** en dos entregables:

1. **`docs/dependency-audit.md`** — versionado en el repo, enlazado desde `architecture.md` §20.
2. **`/mnt/documents/liftgo-dependency-audit.xlsx`** — descargable para revisión offline.

Ambos comparten el mismo dataset; se generan con un solo script.

## Metodología

Para cada utilidad propia en `src/lib/`, `src/lib/forms/` y `src/hooks/`:
- Conteo de **LOC** (excluyendo blank/comentarios cuando trivial).
- Conteo de **consumidores** (`rg -l "from \"@/lib|hooks/<name>\""`).
- **Dep canónica equivalente** según §20.4.
- **Veredicto**: `KEEP (glue <30 LOC)`, `KEEP (sin equivalente)`, `KEEP (ya usa dep canónica)`, `MIGRAR`, `RETIRADO`.
- **Acción recomendada** con prioridad (alta/media/baja/none).

Adicional: tabla de **dependencias del `package.json`** clasificadas:
- **Canónica activa** (en §20.4 y usada).
- **Canónica subutilizada** (en §20.4 pero pocos consumidores → oportunidad de migración).
- **No canónica** (no en §20.4; evaluar si debe escalarse o retirarse).

## Estructura del Excel

Hoja 1 — **Helpers internos** (columnas):
| Archivo | Tipo | LOC | Consumidores | Dep canónica equiv. | Veredicto | Prioridad | Acción |

Hoja 2 — **Dependencias** (columnas):
| Paquete | Versión | Categoría §20.4 | Consumidores aprox. | Estado | Notas |

Hoja 3 — **Resumen** (KPIs):
| Métrica | Valor |
- Total helpers auditados, KEEP / MIGRAR / RETIRADO, LOC total propio, LOC potencialmente migrable, deps canónicas, deps no canónicas.

Formato: fuente Arial, totales con `SUM`, encabezados con fill amarillo (`FFFF00`), negritas. Sin colores de marca custom para mantener legibilidad.

## Estructura del Markdown

`docs/dependency-audit.md`:
1. **Resumen ejecutivo** — 3-5 bullets con hallazgos clave.
2. **Tabla 1 — Helpers internos** (misma data, formato markdown).
3. **Tabla 2 — Dependencias por categoría §20.4**.
4. **Oportunidades de migración priorizadas** — lista numerada con esfuerzo estimado.
5. **Historial** — referencia a alpha.1 (PDF), alpha.3 (toast), alpha.4 (PR template) como aplicaciones previas de §20.

## Script

`scripts/dependency-audit.mjs` (Bun) — un solo archivo que:
1. Lista archivos de `src/lib/**.ts`, `src/lib/forms/**.ts`, `src/hooks/**.{ts,tsx}` (excluye `pdf/`, `domain/`, `constants/` que son carpetas de dominio).
2. Calcula LOC con `wc -l`.
3. Para cada archivo extrae el nombre de export y corre `rg -l` por consumidores.
4. Carga clasificación manual desde un mapa interno (basado en la auditoría ya hecha en alpha.3).
5. Lee `package.json` y clasifica deps contra el stack §20.4.
6. Emite `docs/dependency-audit.md` y `/mnt/documents/liftgo-dependency-audit.xlsx` (via `exceljs` ya disponible? si no, usa `npx xlsx` con un script Python — más simple: usa **Python con openpyxl** porque ya está en sandbox).

Decisión: **script Python** (`scripts/dependency_audit.py`) — más natural para xlsx + markdown.

## Changelog

Entrada `6.6.0-alpha.5` tipo `docs`:
- `public/changelog.json` + `public/changelog/v6.6.0-alpha.5.json`.
- Mencionar enlace `docs/dependency-audit.md` y el xlsx descargable.

## Enlace desde architecture.md

Añadir un bullet al final de §20.6 ("Proceso para retirar código generado"):
> Estado actual: ver `docs/dependency-audit.md` (regenerar con `python scripts/dependency_audit.py`).

## Fuera de alcance

- No se migra código en este PR — el reporte es la base para decidir siguientes pasos.
- No se automatiza en CI (follow-up posible: regenerar en cada push a `main`).

## Riesgo

Nulo en código de producción. Solo se añaden 3 archivos (script, md, xlsx en `/mnt/documents`) + 1 entrada de changelog + 1 línea en `architecture.md`.
