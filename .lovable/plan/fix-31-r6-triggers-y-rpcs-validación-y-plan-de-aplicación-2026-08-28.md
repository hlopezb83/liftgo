# fix-31 (R6): triggers y RPCs — validación y plan de aplicación

Revisé el parche contra la base real. **Los seis hallazgos son bugs reales**, pero el parche trae **dos regresiones** que hay que corregir antes de aplicarlo.

## Hallazgos confirmados

- **R6-01 (crítico).** `sync_invoice_status_from_credit_notes()` hace `RETURN public.sync_invoice_status_from_payments();` — llamar una función de trigger fuera de contexto de trigger truena en tiempo de ejecución. Hoy, cualquier alta/edición de nota de crédito puede fallar y el estatus de la factura no se recalcula. Además el trigger sólo escucha `UPDATE OF status, total`: timbrar o cancelar una NC (`cfdi_status`, `cancellation_status`) no dispara el recálculo.
- **R6-07.** `trg_payment_amount_mxn()` rechaza un pago en divisa distinta a la factura *aunque venga con tipo de cambio*, mientras que `enforce_payment_matches_invoice_currency()` sí lo permite. Dos reglas contradictorias sobre la misma operación.
- **R6-16.** El trigger de moneda de pagos sólo se dispara con `UPDATE OF currency, invoice_id`; borrar el `exchange_rate` de un pago en divisa pasa sin validación.
- **R6-17.** Varias funciones (`sync_forklift_rental_status`, `cancel_booking`, `create_booking`, `complete_return_inspection`, `e2e_seed_portal_scenario`) encienden un GUC de bypass y sólo lo apagan en el camino feliz.
- **R6-20.** El KPI de contratos por vencer no excluye clientes de prueba ni unidades borradas.
- **R6-21.** El desglose de facturas del Panel suma `total` en crudo, mezclando USD y MXN.

Analogía: son válvulas del mismo tablero — una está soldada al revés (R6-01), dos discuten entre sí sobre la misma tubería (R6-07/R6-16) y otras se quedan abiertas si algo falla (R6-17).

## Regresiones del parche que voy a corregir

1. **El `get_financial_kpis` del parche borra el FIX A4**: la versión actual multiplica la renta mensual por el tipo de cambio cuando la reserva está en dólares; la del parche vuelve a sumar en crudo. Conservaré la conversión y sólo agregaré los filtros de R6-20.
2. **Filtro mal puesto en contratos por vencer**: con `LEFT JOIN`, `f.deleted_at IS NULL` desaparece contratos sin unidad asignada. Usaré `(f.id IS NULL OR f.deleted_at IS NULL)`.

También revisaré `get_dashboard_stats` línea por línea contra la definición viva antes de reemplazarla, para no perder fixes previos (N-14/N-16, `is_e2e`, `today_mty`).

## Qué haré

### Base de datos (una migración)
1. Nuevo helper `public.sync_invoice_status(p_invoice_id uuid) RETURNS void`; los dos triggers lo invocan con su propio `NEW/OLD`. Trigger de NC ampliado a `UPDATE OF status, total, cfdi_status, cancellation_status`.
2. `trg_payment_amount_mxn()`: permitir el cruce divisa→MXN cuando hay tipo de cambio (pago o factura); seguir rechazando sólo si no hay ninguno.
3. Trigger de moneda de pagos ampliado a `UPDATE OF currency, invoice_id, exchange_rate, amount`.
4. Envolver los cuerpos de las cinco funciones en `EXCEPTION WHEN OTHERS THEN` + reset del GUC + `RAISE`.
5. `get_financial_kpis`: filtros de R6-20 **conservando** la conversión a MXN del MRR.
6. `get_dashboard_stats`: conversión a MXN en el desglose de facturas, sobre la definición actual.

Todas conservan `SECURITY DEFINER` + `SET search_path = public` + guards de rol, y se re-otorga `EXECUTE` sólo a `authenticated` (nunca `anon`), conforme a las reglas permanentes de migraciones.

### Validación
- Smoke SQL nuevo `supabase/tests/r_fix31_triggers_smoke.sql`: alta/timbrado/cancelación de NC recalcula la factura; pago USD sobre factura MXN con TC pasa y sin TC falla; borrar el TC en un `UPDATE` sí valida; GUC apagado tras un fallo; contratos sin unidad siguen apareciendo en el KPI.
- `bun run test` + typecheck + build.
- Changelog `CHANGELOG.md` y `public/changelog.json` como **v7.366.0** (minor).
