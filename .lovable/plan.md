## Auditoría Ola 3.7 (v7.129.0) — SupplierBillForm

**Estado: verde ✅**

- 63/63 tests de `accounts-payable` pasan (Vitest).
- Schema Zod + `useUnsavedChangesGuard` correctamente integrados.
- Fix del bug de comparación de fechas (`String(Date)` → `Date.getTime()`) verificado en `useSupplierBillForm.ts`.
- Cobertura nueva: 10 tests de schema + 7 tests de hook (creación, update, totales, due date sugerido).
- No detecté bugs ni regresiones. Nada bloqueante.

## Ola 3.8 — Cerrar EC-A3 (crítico) + UX-M6 (quick win)

Con Ola 3.7 estable, quedan 5 hallazgos de la auditoría integral: `EC-A3`, `UX-M3`, `UX-M4`, `UX-M5`, `UX-M6`. Priorizo el único ALTO restante (`EC-A3`) y un UX de bajo esfuerzo del mismo dominio (empty state en filtros).

### 1. EC-A3 — Facturación recurrente: cerrar race check-then-insert

**Estado actual:** Ola 2.2 mitigó el race con `pg_advisory_xact_lock(booking_id)` dentro de `create_recurring_invoice`, pero la auditoría exigía además un **índice único** como red de seguridad última. Hoy no existe: dos ejecuciones desde nodos distintos con locks no cooperativos, o un bypass del RPC, seguirían pudiendo duplicar.

**Cambios (migration nueva):**
- Crear `UNIQUE INDEX CONCURRENTLY invoices_booking_period_uniq ON public.invoice_bookings (booking_id, invoices.billing_period_start)` — implementado como índice único sobre una tabla puente materializada o, más simple, sobre `invoices (booking_id_principal, billing_period_start, billing_period_end) WHERE status <> 'cancelled' AND billing_period_start IS NOT NULL`. Se preserva `NULLS NOT DISTINCT` opcional; se filtra `cancelled` para permitir re-emisión legítima tras cancelación.
- Como `invoices` no tiene FK directa a booking (es N:M vía `invoice_bookings`), añadir columna generada / desnormalizada `primary_booking_id` (o usar la más antigua) sólo si es necesario. Alternativa preferida: índice único parcial sobre `invoice_bookings (booking_id, invoice_period_start_denorm)` con columna denormalizada mantenida por trigger.
- Antes de crear el índice, ejecutar limpieza defensiva: query que detecte duplicados existentes y aborte la migración si hay drift (fail-fast).
- Ajustar `create_recurring_invoice` para capturar `unique_violation` (SQLSTATE 23505) y devolver el `invoice_id` existente en lugar de fallar — semántica idempotente end-to-end.
- Ajustar `generate-recurring-invoices/index.ts` (línea ~384) para tratar 23505 como éxito silencioso, no como error.

**Tests:**
- Deno: nuevo caso en `generate-recurring-invoices/handler.test.ts` simulando 23505 y verificando que se marca como skipped, no error.
- Vitest: no aplica (lógica server-side pura).
- SQL: script de verificación de índice en `supabase/migrations/tests/` (opcional, si existe convención).

### 2. UX-M6 — EmptyState honesto cuando hay filtros activos

**Archivo:** `src/components/layout/ListPageLayout.tsx` líneas ~228-237.

**Problema:** Muestra "Aún no se han registrado registros aquí" incluso cuando el usuario aplicó filtros que no matchean nada.

**Cambios:**
- Añadir prop `hasActiveFilters?: boolean` a `ListPageLayout`.
- Cuando `hasActiveFilters && itemCount === 0`, mostrar copy alterno: "No hay resultados con los filtros actuales" + botón "Limpiar filtros" que dispare `onClearFilters?: () => void`.
- Propagar desde las páginas ya migradas a `useTableFilters` (Facturas, Cotizaciones, Reservas, Facturas de Proveedor, Gastos) leyendo `filters.hasActive` del hook.
- Fallback: si no se pasan props, comportamiento actual intacto (retro-compatible).

**Tests:**
- Vitest: `ListPageLayout.test.tsx` con 3 casos — sin filtros vacío, con filtros vacío, con filtros y resultados.

### Verificación final
- `bunx vitest run` (target: 1121 → ~1125 tests, todo verde).
- `cd supabase/functions && deno test` (todo verde).
- Changelog v7.130.0 (MINOR: nuevo índice + prop UX).

### Fuera de alcance (para olas siguientes)
- `UX-M3` (sr-only en inglés), `UX-M4` (dead-ends en /404 detalle), `UX-M5` (overflow portal móvil) — se agruparán en Ola 3.9 (pulido UX del portal + a11y).
