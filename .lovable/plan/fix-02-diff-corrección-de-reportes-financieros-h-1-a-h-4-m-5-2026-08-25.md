# fix-02.diff — Corrección de reportes financieros (H-1 a H-4, M-5)

Validé el diff contra la base de datos y el código actual: los cinco hallazgos son bugs reales.

## Qué está mal hoy (verificado en la BD)

- **H-1 — Ingresos por mes**: `report_revenue_by_month` no resta ninguna nota de crédito timbrada, y la columna "pagado" se calcula con `total FILTER (WHERE status = 'paid')`, es decir factura completa marcada como pagada, no pagos reales. Facturas con abonos parciales aparecen como $0 cobrado.
- **H-2 — Divisa sin tipo de cambio**: cuando una factura está en USD y no tiene `tipo_cambio`, la función y la vista `v_invoices_with_balance` la suman **como si fueran pesos** (1:1), inflando/deflactando el reporte ~18×.
- **H-3 — Rentabilidad por modelo**: `report_profit_by_model` usa `i.total` (con IVA, sin convertir a MXN), no resta notas de crédito y sólo considera `invoices.booking_id`, ignorando la tabla puente `invoice_bookings` (facturas multi-reserva quedan fuera del ingreso del modelo).
- **H-4 — Depreciación**: en el estado de resultados la depreciación no se limita a la vida útil de 48 meses ni se prorratea por días del primer/último mes.
- **M-5 — Estado de resultados base "efectivo"**: reconoce ingreso por facturas marcadas como pagadas en vez de por pagos reales del mes, y no acota la deducción de notas de crédito al ingreso ya reconocido.

## Plan

### Fase 1 — Migraciones SQL (en este orden)
1. `h1_report_revenue_nc_payments` — resta NCs timbradas y calcula `paid` desde la tabla `payments` con tipo de cambio del pago.
2. `h2_fx_missing_docs` — reemplaza la función (nueva columna `fx_missing_count`) y la vista `v_invoices_with_balance` (nueva columna `fx_missing`); los documentos en divisa sin tipo de cambio devuelven `total_mxn`/`balance_mxn` en **NULL** en vez de convertirse 1:1.
3. `h3_report_profit_by_model` — usa `subtotal` convertido, resta NCs timbradas y cubre `invoice_bookings`.
4. `h4_income_statement_depreciation_48m` — depreciación acotada a 48 meses con prorrateo por días.
5. `m5_income_statement_cash_payments` — base efectivo desde pagos reales; incluye H-4 (la versión final de `get_income_statement` es esta).

Todas mantienen `SECURITY DEFINER` + `SET search_path = public` + guard `has_permission('Reportes','read')` y `REVOKE ... FROM PUBLIC` / `GRANT EXECUTE TO authenticated`, conforme a las reglas permanentes de migraciones.

### Fase 2 — Frontend (necesario, el diff no lo trae)
Cambiar la firma del RPC rompe los tipos y deja huecos de UI:

- `useRevenueByMonthReport.ts`: mapear `fx_missing_count` y exponerlo en el tipo `RevenueMonthRow`.
- Reporte de ingresos: mostrar un aviso cuando `fxMissingCount > 0` ("N facturas en divisa sin tipo de cambio no se incluyeron").
- **Corregir el fallback peligroso**: hoy `useInvoicesWithBalance.ts:83`, `AgingReport.tsx:51` y `useDashboardSections.ts:50` hacen fallback a `balance` crudo cuando `balance_mxn` es NULL. Con H-2 eso volvería a mezclar USD con MXN. Se cambia a: usar `fx_missing` para excluir del total y marcar la fila con badge "Sin TC", en vez de sumar la cifra cruda.
- Regenerar `src/integrations/supabase/types.ts`.

### Fase 3 — Verificación
- Smoke SQL nuevo en `supabase/tests/` (pago parcial, NC timbrada, factura USD sin TC, factura multi-reserva) para que corra en el job `rls-db-tests`.
- Vitest de los hooks tocados + `bun run build` + suite completa.
- Changelog: nueva entrada **minor** (v7.336.0) más su archivo de detalle.

## Detalle técnico

- H-2 requiere `DROP FUNCTION` de `report_revenue_by_month(date,date)` por cambio de firma; la vista sí admite `CREATE OR REPLACE` porque la columna nueva va al final.
- H-4 queda sobrescrito por M-5 en la misma tanda; se aplican ambas migraciones para conservar la historia, y el estado final es el de M-5.
- `paid_mxn` usa `COALESCE(NULLIF(p.exchange_rate,0), NULLIF(i.tipo_cambio,0), 1)`: si el pago no trae TC hereda el de la factura.
