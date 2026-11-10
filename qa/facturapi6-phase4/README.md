# Fase 4 · Kit de activación Facturapi 6.0.0 (preparado, NO aplicado)

Estado al 10/11/2026: producción sigue en Facturapi **5.2.0**. Este kit deja la activación lista para una ventana supervisada; no cambió las funciones del backend, no desplegó, no ejecutó SQL ni emitió documentos.

## Qué contiene

| Archivo | Para qué |
|---|---|
| `staged/` | Los 7 archivos finales con 6.0.0 (incluye `deno.lock`) |
| `rollback/` | Copia exacta de los 7 archivos actuales con 5.2.0, para revertir |
| `activation.patch` | Diff completo base → 6.0.0 para revisión |
| `MANIFEST.json` | Huellas SHA-256, funciones a desplegar, tareas automáticas, tenant de prueba |
| `activation.py` | `check` / `apply` / `rollback` con guardas: kit íntegro, estado exacto, ventana del run-id |
| `build_manifest.py` | Regenera o verifica (`--check`) el manifiesto |
| `sql/` | Consultas preparadas, **no ejecutadas**: estado/pausa/reanudación de 2 tareas automáticas y verificación de solo lectura de ELOGISTIX |
| `RUNBOOK.md` | Pasos de la ventana, reversa y qué autorizas |
| `test_activation.py` | 26 pruebas offline del kit |

## Hallazgo corregido respecto de la Fase 1

`qa/facturapi6-phase1/phase1.patch` cambiaba `deno.json` a 6.0.0 pero **no** `deno.lock`. La integración continua cachea Deno con `--frozen`; con ese parche falla con «The lockfile is out of date» (reproducido en copia temporal). Este kit agrega el lock con sólo 4 líneas cambiadas y la integridad publicada en npm para `facturapi@6.0.0` (`sha512-A/aQnB0M…e9w1Q==`, verificada contra el registro). La Fase 1 queda como antecedente; para activar se usa este kit.

## Evidencia offline (copias temporales, sin red al proveedor)

- El parche de Fase 1 aplica limpio sobre las funciones actuales y reproduce sus `staged/`; no hubo cambios operativos desde su preparación.
- 241 archivos TypeScript de las funciones: `deno check` sin errores con 6.0.0.
- `deno fmt --check` (245 archivos) y `deno lint` (241) sin hallazgos.
- Script de CI `scripts/deno-tests-offline.sh` con lock congelado: **1115 pruebas pasan, 0 fallan**.
- Mismo conjunto de 88 archivos fiscales sin red: 1048 con 5.2.0 y 1053 con 6.0.0, 0 fallas; la diferencia es el contrato de SDK.
- `facturapi@6.0.0` sigue siendo `latest` en npm, sin dependencias ni imports `node:`.
- Funciones que cargan el SDK y deben desplegarse: 12 (`deploy_functions`), igual por grafo de `deno info` y por el recorrido estático del kit.
- Tareas automáticas fiscales vigentes según migraciones: `process-cfdi-retry-queue-5min` y `reconcile-stamping-invoices-5min` (cada 5 min). El estado real de `cron.job` se lee en la ventana; no se consultó ahora.
- 26/26 pruebas del kit: estados base/aplicado/parcial/ajeno, ventana, kit alterado, falla de escritura a la mitad con regreso a base, reversa, SQL sin secreto de cron ni escrituras fuera de `active`.

Local Deno 2.8.3; CI usa 2.9.8. La suite completa queda confirmada en GitHub Actions.

## Qué NO prueba

El runtime Deno desplegado, el sandbox real de Facturapi/SAT ni la persistencia con la base real. Eso ocurre por primera vez en la ventana del `RUNBOOK.md`, con reversa inmediata.

## Decisión de ruta

La copia QA de la Fase 3 (`qa/facturapi6-phase3/adaptation/`) intentaba ejecutar las funciones fuera de Deno desde la vista previa; aun terminada, no probaría el runtime real y la revisión la mantuvo en NO-GO. La ventana supervisada usa las funciones reales y la empresa de prueba antes de dar por buena la activación. Si prefieres un sandbox completo antes de tocar producción, esa copia sigue disponible con sus pendientes en `WIRING_REVIEW.md`.

## Para continuar

Hace falta tu autorización explícita de una ventana con run-id `fx6-prod-AAAAMMDDTHHMMZ` (ver `RUNBOOK.md`). Sin ella, nada de este kit se aplica. El preflight de la vista previa sigue `enabled=false`, `shutdown=true`.
