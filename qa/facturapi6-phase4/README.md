# Fase 4 · Kit de activación Facturapi 6.0.0 (preparado, NO aplicado)

## Activación del 10/11/2026 · estado vigente

El usuario indicó expresamente «Continua sin respaldo» tras conocer la limitación del cierre automático. Se aplicó el kit exacto en `fx6-prod-20261110T2025Z` y la herramienta oficial confirmó el despliegue de las 12 funciones del manifiesto. Antes de aplicar: jobs 18/19 activos, cero corridas registradas en curso. Se pausaron únicamente esos IDs y nombres; se restauraron durante esta misma intervención. Lectura final: ambos `active=true` a las 20:26 UTC aproximadamente. No se dejó restauración pendiente en segundo plano.

Verificación local: `estado=applied`, manifiesto vigente, 26/26 pruebas puntuales. La herramienta reportó éxito de despliegue y hashes de fuentes enviadas; esto no demuestra arranque por petición, paridad Deno real ni emisión/persistencia sandbox. No se invocó ninguna función fiscal ni se leyó llave o proveedor. El usuario confirmó CI del kit anterior; CI del commit de activación queda pendiente.

Pendiente: los cuatro documentos autorizados en ELOGISTIX y sus PDF/XML/cancelación/refresco; una ventana de pruebas con pausa requerirá nueva coordinación, pues las tareas ya están reanudadas. No repetir emisiones inciertas. Preflight sigue apagado. Fase 5 espera dos semanas estables. Las secciones siguientes conservan antecedentes previos a la activación.

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

El usuario autorizó iniciar el 10/11/2026 a las 18:30 UTC; posteriormente confirmó GitHub Actions verde para `2481ecf0f` y receptor ficticio listo. La autorización existe, pero no se inició el cambio: tras recibir las confirmaciones el reloj del entorno marcaba 20:16 UTC, fuera de los 60 minutos originales. No se extiende ni reutiliza esa ventana.

Comprobaciones previas: kit íntegro, árbol en `estado=base`, manifiesto vigente y 26/26 pruebas puntuales offline. En la consulta inicial los jobs 18 y 19 estaban activos, con cero corridas registradas en curso; eso no garantiza su estado posterior. La confirmación de CI proviene del usuario, no de una consulta independiente a GitHub.

Bloqueo adicional: el runbook depende de otra intervención para reanudar los jobs; no hay cierre automático preparado que garantice el máximo de 60 minutos si la conversación se interrumpe. Antes de pausarlos hace falta revisar ese mecanismo y abrir una ventana fresca. No se pausaron tareas, aplicó el kit, desplegó, emitió ni consultó al proveedor. El preflight de la vista previa sigue `enabled=false`, `shutdown=true`.

La revisión posterior del plan aprobado confirmó que `pg_cron` permite preparar un respaldo SQL, pero no garantiza completar la restauración en 60 minutos. Se detuvo antes de cualquier pausa o activación, como exige el plan. Evidencia y alternativa pendiente de decisión en `RESTORATION_REVIEW.md`.
