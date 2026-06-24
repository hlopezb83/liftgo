# Fix Estado de Resultados — COGS de Ventas

## Problema

El RPC `get_income_statement` calcula COGS de equipos vendidos a partir de `forklifts.status = 'sold'` y la fecha del `status_logs`, **sin ligarlo a la factura ni al cliente**. Esto produce:

1. **Desfase de mes**: si el equipo se marca `sold` semanas o meses después de facturado, el COGS cae en un mes distinto al ingreso.
2. **Atribución engañosa en la UI**: el desglose COGS del mes muestra equipos cuyo ingreso pertenece a otra factura/cliente. (Caso reportado: BERN CO feb-2026 muestra COGS $882,232.43 que en realidad corresponde a un equipo vendido a INDIMEX GLASS en nov-2025, cuyo status flipeó en febrero).
3. **COGS huérfano**: ventas históricas re-aparecen como COGS al volverse a tocar el status; ventas nuevas se quedan sin COGS hasta que alguien cambie manualmente el status.
4. **Resta de meses rentados** se aplica también a equipos de venta directa que nunca se rentaron — sólo aplica si previamente hubo depreciación reconocida.

## Solución

Reescribir la sección de COGS del RPC `get_income_statement` para que se base en la **factura de venta** (fuente de verdad del ingreso), no en `forklifts.status`.

### Nueva fuente de COGS

Para cada factura de venta dentro del período (`quote_type = 'sale'`, no e2e, no cancelada, no borrador):

1. Obtener los equipos vendidos vía `quote_assigned_forklifts` (mapeo `line_index`).
2. Sumar `acquisition_cost` (neto de depreciación previamente reconocida) de esos equipos.
3. Reconocer ese COGS en el **mismo mes y basis** que el ingreso de la factura (`issued_at` o `paid_at`).
4. Atribuirlo al **mismo `customer_name`** que el ingreso.

### Ajustes específicos en el RPC

- Reemplazar CTEs `sold_forklifts`, `sold_in_period`, `months_rented_per_sold`, `cogs_per_sold`, `cogs_by_month` por:
  - `sale_invoices` = `inv_classified` filtrado por `NOT is_rental` y `quote_id IS NOT NULL`.
  - `sale_invoice_forklifts` = join con `quote_assigned_forklifts` → `forklifts` (sólo `acquisition_cost > 0`, no e2e).
  - `cogs_per_invoice` = book_value por equipo con la fórmula existente de descuento por meses rentados (`bookings` previos a `issued_at`).
  - `cogs_by_month` = SUM por `month_key`, `jsonb_object_agg` por `customer_name — forklift_name` para que el desglose UI muestre a quién pertenece cada COGS.
- `sold_without_cost` se redefine como: equipos referenciados en facturas de venta del período cuyo `acquisition_cost` es nulo/0 (no por `status='sold'`).
- Conservar consolidación con `supplier_bills.category = 'costo_venta'` tal como hoy (en TS).

### Cambios en frontend

- `useMonthlyData.ts`: sin cambios estructurales (sigue leyendo `cogs_by_forklift` del RPC). El label ahora incluirá cliente: `"BERN CO — LIFT GO FB25"`.
- `incomeStatementHelpers.ts` `getBreakdownFor`: sin cambios.
- Tooltip/alerta "Equipos vendidos sin costo": sigue mostrando los del nuevo cálculo.

### Verificación

- Test unitario nuevo en `src/test/` (o `useMonthlyData.test.ts` si existe) que simule:
  - Factura de venta con 1 equipo → COGS = acquisition_cost en mes de `issued_at`.
  - Factura de venta multi-equipo → suma de costos.
  - Equipo con flip de status fuera del período → no aparece como COGS.
  - Equipo previamente rentado → book value descontado por meses rentados.
- Validación manual en preview: feb-2026 debe mostrar COGS ≈ $316,794 ligado a BERN CO; el $882k debe **desaparecer** de feb y aparecer como ajuste retroactivo a nov-2025 (donde está la factura FAC-0001 de INDIMEX GLASS).

## Detalles técnicos

- Una sola migración nueva: `supabase/migrations/<ts>_fix_income_statement_cogs.sql` con `CREATE OR REPLACE FUNCTION public.get_income_statement(...)`. `SET search_path = public`, `SECURITY DEFINER`, mismos checks de rol.
- `acquisition_cost` se lee a la fecha actual del forklift; no hay snapshot histórico. Aceptable porque el costo de adquisición no cambia.
- Si una factura de venta no tiene `quote_id` o el quote no tiene `quote_assigned_forklifts`, se reporta en `sold_without_cost` para que el usuario lo arregle (no se asume costo).
- `is_e2e` se respeta tanto en facturas como en forklifts.
- Entrada en `public/changelog.json` + detalle `public/changelog/v6.95.0.json` (patch de bug crítico de reporting → minor por cambio de semántica del cálculo).

## Archivos a tocar

- `supabase/migrations/<nueva>.sql` (nueva)
- `public/changelog.json` (edit)
- `public/changelog/v6.95.0.json` (nueva)
- `src/integrations/supabase/types.ts` (regenerado automáticamente; sin cambio manual)
- Test nuevo en `src/test/` o `src/features/reports/hooks/__tests__/`

## Fuera de alcance

- Reformulación de depreciación de equipos rentados (lógica actual se conserva).
- Atribución por cliente del ingreso por rentas (ya funciona).
- Snapshots históricos de `acquisition_cost`.
