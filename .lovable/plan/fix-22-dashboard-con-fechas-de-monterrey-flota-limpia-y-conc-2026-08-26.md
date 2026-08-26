# fix-22: Dashboard con fechas de Monterrey, flota limpia y conciliación bidireccional

Revisé los cinco hallazgos contra la base de datos y el código actual. Los cinco son bugs reales.

## Qué está mal hoy (verificado)

- **R4-06 — Fechas en UTC.** `get_dashboard_stats` usa `CURRENT_DATE` en todos sus bloques (vencidas, rentas atrasadas, alertas de mantenimiento, meses de flujo de efectivo). Entre las 18:00 y 23:59 hora de Monterrey el servidor ya "cambió de día", así que el dashboard adelanta un día facturas vencidas y meses.
- **R4-07 — Utilización inflada.** El bloque `utilization` suma los días de **todas** las reservas de cada unidad, incluidas canceladas y las que aún no empiezan, y divide entre los días desde que se dio de alta el equipo. Una reserva futura de 6 meses sube hoy la utilización.
- **R4-08 — Flota archivada y de pruebas contada.** Ni `fleet_counts`, ni `utilization`, ni las alertas de mantenimiento excluyen unidades con `deleted_at` o marcadas `is_e2e` (ambas columnas existen en `forklifts`). Los totales de flota incluyen equipos archivados y datos sembrados por pruebas.
- **R4-09 — Flujo de efectivo mezcla monedas.** `cash_flow.paid` suma `payments.amount` en crudo (un pago de 1,000 USD cuenta como 1,000 MXN) y el `LEFT JOIN` a facturas está presente pero **no filtra nada** (`WHERE TRUE`), así que entran pagos de facturas canceladas y de pruebas. `cash_flow.invoiced` suma `invoices.total` sin convertir con `tipo_cambio`.
- **R4-11 — Conversión FX de un solo sentido.** `convertPaymentAmount` en `matchingScore.ts` siempre multiplica por el tipo de cambio. Cuando la cuenta bancaria está en dólares y el pago en pesos, hay que **dividir**; hoy el candidato correcto queda fuera de la tolerancia y nunca se sugiere. Falta además redondear a 2 decimales antes de comparar contra la tolerancia de 0.01.

## Qué se va a hacer

### Base de datos (una sola migración con la versión final de `get_dashboard_stats`)

El diff trae cuatro migraciones que se reescriben una encima de otra. Se aplicará **una sola** con el resultado final acumulado (R4-06 + R4-07 + R4-08 + R4-09), conservando los guards de rol existentes, `SECURITY DEFINER`, `SET search_path = public` y los `GRANT` actuales:

- Todo `CURRENT_DATE` pasa a `public.today_mty()`.
- `utilization`: solo reservas `confirmed`/`completed` que ya iniciaron, con `end_date` acotado a hoy; se agrega bucket `out_of_service`.
- Filtro `deleted_at IS NULL AND is_e2e IS NOT TRUE` en los cinco bloques de flota.
- `cash_flow.paid` suma `payments.amount_mxn` y excluye pagos de facturas canceladas o de prueba mediante el JOIN; `cash_flow.invoiced` convierte con `tipo_cambio` usando la misma precedencia que `report_revenue_by_month`.

Segunda migración para R4-11: `confirm_bank_match` y `get_bank_match_candidates` con conversión bidireccional (`MXN → divisa` divide, resto multiplica) y `ROUND(..., 2)` antes de comparar la tolerancia. Se mantienen `REVOKE ... FROM PUBLIC, anon` y `GRANT EXECUTE TO authenticated`.

### Frontend

- `src/features/bank-reconciliation/lib/matchingScore.ts`: `convertPaymentAmount` divide cuando el pago es MXN y la cuenta está en divisa, multiplica en el caso contrario, y redondea a 2 decimales para tener paridad exacta con el RPC. Se actualiza el comentario de la función.
- Tests nuevos en la suite de `matchingScore` para el caso MXN → cuenta USD y para el redondeo en el borde de la tolerancia.

### Cierre

- Nueva entrada de changelog **v7.353.0** (minor) + `gen-version.mjs`.
- Verificación con la suite de Vitest completa y el linter de migraciones.

## Notas

No hay backfill: los cambios son de cálculo/lectura, así que los números del dashboard se corrigen solos en la siguiente carga. Ningún dato histórico se modifica.
