# Validación de fix-09.diff — 2 bugs reales, 2 a descartar

Revisé cada corrección contra el estado real de la base de datos y del código.

## R-1 — Pago a proveedor con fecha de "mañana" — BUG REAL, corregir

Confirmado: `register_supplier_payment` tiene hoy `p_payment_date date DEFAULT CURRENT_DATE`. `CURRENT_DATE` usa UTC, que cambia de día a las 18:00 hora de Monterrey. Un pago capturado a las 7 pm queda fechado al día siguiente.

Acción: cambiar el default a `public.today_mty()` y usar `COALESCE(p_payment_date, public.today_mty())` en el INSERT. El resto de la función (guards de rol, validación de monto, bloqueo de canceladas) se conserva idéntico.

## R-2 — No se puede reversar un pago de una factura ya pagada — BUG REAL, corregir

Confirmado: `recalc_supplier_bill` marca `app.cxp_recalc = 'on'` antes de actualizar `supplier_bills`, pero el trigger `trg_lock_paid_supplier_bill` (función `lock_paid_supplier_bill_with_payments`) no respeta ese bypass. Al borrar uno de varios pagos de una factura en estado `paid`, el recálculo intenta pasarla a `partial`, quedan pagos con suma > 0 y el trigger lanza excepción: la factura queda atorada en `paid` para siempre.

Acción: agregar al inicio del trigger el bypass `IF current_setting('app.cxp_recalc', true) = 'on' THEN RETURN NEW; END IF;`, igual que otros candados del ERP. El bloqueo sigue activo para ediciones manuales.

## H-6 — Índice único de factura manual por reserva — DESCARTAR

Dos motivos verificados:

1. Ya existe el trigger `trg_enforce_invoice_booking_period` (implementado en v7.335.0): toda factura nueva ligada a una reserva exige periodo, así que el caso `billing_period_start IS NULL` ya no puede crearse hacia adelante.
2. El índice propuesto **fallaría al crearse**: hay 12 reservas con facturas históricas sin periodo (hasta 6 por reserva). La migración rompería el despliegue, y limpiarlas contradice la decisión previa de no tocar el pasado.

## H-13 — Vista pública de datos de empresa — DESCARTAR

`company_settings` ya no tiene ninguna policy para `anon` (solo roles autenticados); el `DROP POLICY` sería un no-op. Además, ninguna pantalla previa al login lee esa tabla en el código actual. Crear `public_company_settings` con `GRANT SELECT ... TO anon` **abriría** una superficie que hoy está cerrada, sin necesidad funcional. No aplicar.

## Detalles técnicos

- Una migración nueva con las dos correcciones (R-1 y R-2), ambas `CREATE OR REPLACE FUNCTION`, sin DDL de tablas, cumpliendo las reglas permanentes (`SET search_path TO 'public'`, guards de rol, `(select auth.uid())`).
- Prueba de humo SQL en `supabase/tests/` que registre dos pagos, borre uno y verifique que la factura pasa de `paid` a `partial` sin excepción.
- Changelog: entrada nueva **v7.342.4** (patch) con fecha de hoy, más su archivo de detalle en `public/changelog/`.
