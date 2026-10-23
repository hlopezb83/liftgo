# B1: recurrencia probada contra producción

## Alcance

- `index.ts` conserva el registro incondicional `Deno.serve`; el cuerpo existente se mueve a `handler.ts`, importable sin listener.
- `buildPlan` acepta una fecha explícita opcional. Producción sigue calculando la fecha de Monterrey en el mismo punto del flujo.
- `periods.ts` contiene las fronteras inclusivas, el predicado de cierre y el contador de pendientes que usa el plan real. `grouping.ts` contiene el agrupado que usa `executePlan`.
- No cambia el orden de consultas, la selección de reservas, los importes ni la política manual-only. No cambia SQL, locks, migraciones, PAC, esquema ni despliegue.
- Los tests de catch-up, cierre y aislamiento dejan de implementar copias de la lógica productiva. Los fixtures sólo representan datos y las respuestas del cliente; las decisiones se ejecutan en las funciones reales.

## Contratos protegidos

- Primer y último periodo parcial, día final inclusivo, mes completo y febrero bisiesto.
- Tope de 24 periodos: 54 pendientes en el caso de atraso extenso, sin truncamiento cuando quedan exactamente 24.
- Historial directo y pivote, cursor desincronizado, cancelaciones, cancelación fiscal pendiente y documentos legacy sin periodo.
- Agrupación por organización, cliente, ambas fronteras, moneda y TC; tasa fiscal del cliente por organización.
- Autenticación antes de leer, organización resuelta en servidor, cron sólo preview, selección vacía y ausencia de selector cerradas, selección por reserva y periodo.
- Confirmación de tarifas antiguas, segunda lectura de disponibilidad y uso exclusivo del RPC atómico para crear; resultado idempotente y error de guard sin escrituras alternativas.

## Verificación local (2026-10-23)

- Deno 2.9.7: **61 tests offline pasan**, con comprobación de tipos. Seleccionados mediante `scripts/deno-test-selection.sh offline`; se excluye el smoke remoto `index_test.ts`.
- `deno fmt --check` y `deno lint`: pasan los diez archivos Edge modificados/nuevos.
- Vitest 4.1.11: `src/lib/fiscal/recurringLegacyVat.backend.test.ts`, **2/2 pasan** con un worker.
- Cinco mutaciones temporales del código productivo son detectadas por assertions: omitir organización, omitir moneda, omitir TC, convertir el fin en exclusivo y eliminar el prorrateo final. Todas se restauraron antes de la última suite verde.
- `git diff --check`: pasa.

La ejecución Deno local se hizo con `--cached-only`, sin permiso de red, sin configurar credenciales y con clientes ficticios. La caché tiene `std/assert` real pero no la URL `https://esm.sh/@supabase/supabase-js@2`: un import map de validación, fuera del repositorio, resuelve únicamente ese SDK al paquete ya instalado con sus tipos. No se agregan dependencias o sustituciones al runtime productivo. El grafo remoto exacto de CI queda pendiente de su entorno normal.

Para repetir en un entorno Deno con las dependencias disponibles, ejecutar desde `supabase/functions` los archivos offline de `generate-recurring-invoices` con `deno test --allow-env --allow-read`, sin `--allow-net`. No incluir `index_test.ts`.

## Límites

No se probaron PAC ni base de datos real. El test verifica que las escrituras siguen delegándose en `create_recurring_invoice`, no simula ni certifica el advisory lock o la concurrencia SQL. No se ejecutó el runner SQL de ciclo de vida; sólo se actualizó su referencia estática de `index.ts` a `handler.ts`. B3 (consultas por lotes/rendimiento) sigue separado de este cambio.
