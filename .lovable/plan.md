# fix-16: Panel y reportes financieros (N-14, N-16, N-15, N-19, N-20)

Revisé los cinco hallazgos contra la base de datos real. **Los cinco son bugs reales** y valen la pena.

## Qué está mal hoy (verificado)

- **N-14 — El Panel pide datos que la base nunca manda.** `get_dashboard_stats()` sólo devuelve `fleet_counts`, `invoice_stats`, `overdue_invoices`, `overdue_bookings`, `cash_flow` y `monthly_utilization`. El frontend (`dashboardSectionHelpers.ts`, `queryKeys.ts`) espera además `utilization` (ingreso por unidad) y `maintenance_alerts` (próximos servicios): esas tarjetas siempre salen vacías.
- **N-16 — Conteos de flota que no cuadran.** `fleet_counts.rented` se calcula con una subconsulta de reservas confirmadas, mientras que `available`/`maintenance`/`retired` salen de `forklifts.status`. Los grupos se traslapan y la suma no da el total. Además ninguna cifra del Panel excluye los documentos de prueba (`is_e2e`), aunque los reportes sí lo hacen.
- **N-15 — Vencido inflado/incompleto.** `get_financial_kpis()` suma `balance_mxn` sin excluir facturas en divisa sin tipo de cambio (`fx_missing`), que llegan como NULL y desaparecen silenciosamente del total, sin avisar cuántas quedaron fuera.
- **N-19 — El tipo de cambio del pago se ignora.** El trigger `trg_payment_amount_mxn` usa primero el tipo de cambio de la *factura* y sólo después el del *pago*; `report_revenue_by_month` hace lo contrario. Mismo pago, dos cifras en MXN distintas según dónde se mire.
- **N-20 — Cobrado con tipo de cambio inventado.** En `report_revenue_by_month`, el bloque de pagos cae a `1` cuando no hay tipo de cambio: un pago de 1,000 USD entra como 1,000 MXN sin marcar `fx_missing_count`.

## Qué haremos

### Base de datos (una migración por hallazgo)
1. `get_dashboard_stats()` — versión única que: agrega `utilization` (top 10 unidades por ingreso, % de uso acotado a 100) y `maintenance_alerts` (próximo servicio en ≤7 días, un registro por unidad); pasa `fleet_counts.rented` a `forklifts.status = 'rented'` (grupos disjuntos); y filtra `is_e2e IS NOT TRUE` en facturas, ingresos y flujo de efectivo. Se aplica como una sola función final (N-14 + N-16 juntos, evitando reescribirla dos veces).
2. `get_financial_kpis()` — excluye `fx_missing` del `overdue_total` (actual y previo) y agrega la llave `overdue_fx_missing_count`.
3. `trg_payment_amount_mxn` — precedencia: tipo de cambio del pago → tipo de cambio de la factura → 1.
4. `report_revenue_by_month` — quita el fallback 1:1 en pagos y suma esos casos a `fx_missing_count`.

Todas conservan `SECURITY DEFINER` + `SET search_path = public` + los guards de rol existentes, y se re-otorga `EXECUTE` sólo a `authenticated` (sin `anon`), conforme a las reglas permanentes de migraciones.

### Frontend
- Tipar y mostrar `overdue_fx_missing_count` en el KPI de vencido del Panel con un aviso discreto ("N factura(s) en divisa sin tipo de cambio no se incluyen"), reutilizando el patrón ya usado en el reporte de antigüedad de saldos.
- Verificar que las tarjetas de utilización por unidad y alertas de mantenimiento ya rendericen con los nuevos datos (no requieren cambios de lógica).

### Validación
- Smoke SQL nuevo `supabase/tests/r_fix16_dashboard_finanzas_smoke.sql`: llaves presentes en el Panel, conteos disjuntos, exclusión de `is_e2e`, precedencia FX del pago y `fx_missing_count` sin fallback 1:1.
- `bun run test` completo + build, y actualización de `public/changelog.json` / `CHANGELOG.md` como **v7.348.0** (minor).

## Notas técnicas
- El trigger N-19 sólo afecta filas nuevas o actualizadas de `payments`; **no** se hará backfill de `amount_mxn` histórico salvo que lo pidas.
- N-20 hará que algunos meses muestren "cobrado" menor al actual: es correcto, hoy se está contando USD como MXN.
