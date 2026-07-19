# Auditoría v7.94.0 y siguiente fase

## Auditoría de v7.94.0

### Verificaciones OK

- **RPC `convert_quote_to_bookings**` desplegada, con REVOKE PUBLIC + GRANT authenticated y validación de rol interna.
- **Columnas `daily_rate/weekly_rate/monthly_rate**` en `bookings` confirmadas.
- **Cron `expire-stale-quotes-daily**` creado (jobid 4 devuelto por la migración; `cron.job` no es consultable desde psql, esperado en Cloud).
- `**useQuoteBookingCreator**` ya usa la RPC; se eliminó el rollback best-effort y las llamadas sueltas a `supabase.from("bookings").delete()`.
- **Tests** de `applyRatesToBookings` y `quoteBookingBuilders` pasan (9/9).

### Bugs / gaps detectados

1. **Dead code**: `applyRatesToBookings` en `quoteBookingBuilders.ts` ya no se usa en producción (sólo lo referencia su propio test). Con el nuevo flujo la RPC aplica las tarifas server-side, así que el helper y su test deben desaparecer para no confundir a futuros lectores.
2. **Falta test para `useQuoteBookingCreator**` en el nuevo camino RPC: forma del payload (`p_assignments` con snake_case), manejo del `error` de Supabase, invalidaciones de query keys y llamada a `buildDeliveryInfos` con los IDs devueltos por la RPC.
3. **Falta test Deno/psql para `convert_quote_to_bookings**`: atomicidad ante fallo intermedio (segunda reserva con forklift no disponible ⇒ ninguna reserva persiste), rechazo por `status = accepted`, rechazo por arreglo vacío, marcado final de la cotización a `accepted`.

## Fase 0 · Patch v7.94.1 (limpieza + tests que faltan)

- Eliminar `applyRatesToBookings` de `quoteBookingBuilders.ts` y borrar `applyRatesToBookings.test.ts`.
- Crear `useQuoteBookingCreator.test.ts` con mocks del cliente de Supabase (RPC + invalidaciones) cubriendo éxito, error RPC y payload correcto.
- Crear `supabase/tests/convert_quote_to_bookings.test.sql` (pgTAP-lite con `DO $$ ... $$`) para atomicidad + validaciones.
- Entrada nueva en `public/changelog.json` + `public/changelog/v7.94.1.json`.

## Fase 1 · Sprint v7.95.0 (dominios pendientes del plan previo)

### Cash flow por método de pago

- Revisar `get_dashboard_stats` y `get_cash_flow_by_method` (si existen) para confirmar que la agregación separa efectivo, transferencia, tarjeta y cheque tanto en cobros como en pagos a proveedores.
- Confirmar que `payments.payment_method` y `supplier_payments.payment_method` se leen con el mismo vocabulario (enum vs texto libre).
- Test Vitest sobre la card del dashboard con mocks para verificar totales por método.

### RLS de `customer_payment_intents` (portal)

- Auditar que tras el switch a `approve_payment_intent` / `reject_payment_intent` (v7.91.0) las políticas RLS ya no permiten UPDATE directo desde el cliente autenticado del portal — sólo SELECT/INSERT.
- Confirmar que el cliente del portal no puede aprobar intents de otro cliente (`customer_id = auth_customer_id()`).
- Si falta blindaje, endurecer políticas y agregar test con dos usuarios de portal.

### Deliverables

- Migración con ajustes de RLS si aplica.
- Tests unitarios y de integración.
- Changelog v7.95.0 (minor).

## Preguntas para el usuario

¿Ejecuto Fase 0 (limpieza + tests que faltan) y Fase 1 (v7.95.0 completo) en el mismo turno, o dividimos? mismo turno