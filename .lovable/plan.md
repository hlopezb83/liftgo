
# Sprint: Pulido Estado de Resultados + DRIFT residual

Ejecutar los 8 issues del documento (PL-01 → PL-08) en el orden recomendado. Un changelog por issue (v7.110.0 → v7.110.7).

## P0 — Precisión del P&L

### PL-01 · Depreciación por calendario + flota ociosa (v7.110.0)
- Migración: reescribir CTE `depreciation_per_month` en `get_income_statement`. Mensual = `acquisition_cost / 48` por cada mes en que el equipo estuvo activo (no vendido/dado de baja), sin ponderar por días rentados.
- Split en dos métricas: `depreciation_rented` (proporcional a días rentados) y `depreciation_idle` (resto). `depreciation = rented + idle`.
- Agregar columnas `forklifts.acquisition_date date` y `forklifts.sold_at date` (NULL = created_at / sigue activo). Backfill NULL.
- `depreciation_by_forklift`: total por calendario.
- `cogs_per_sale` usa depreciación acumulada por calendario (consistencia con valor en libros).
- UI (`IncomeStatementTable` + tipos en `useIncomeStatementData` / `types.ts` / `useMonthlyData` / `useStatementRows`): agregar fila "(-) Depreciación (Flota Ociosa)" tras la de rentados. Utilidad Neta resta depreciación TOTAL.
- Changelog v7.110.0 documentando cambio de criterio y que cifras históricas cambian.

### PL-02 · Quitar clamp `GREATEST(0, ...)` en ingresos (v7.110.1)
- En CTE `combined` del RPC, permitir ingreso neto negativo por mes en las 4 líneas de revenue.
- Verificar render de negativos en tabla y PDF (rojo, formato `(5,800.00)`). Ajustar `formatCell`/`StatementTableRow` si es necesario.
- Changelog v7.110.1.

## P1 — Datos nuevos

### PL-03 · Prorrateo de gastos con cobertura (v7.110.2)
- Migración: `supplier_bills.coverage_start date`, `coverage_end date` (nullable).
- Formulario CxP: dos date pickers "Inicio/Fin de cobertura", visibles sólo si `category ∈ {seguros_equipo, seguros_gastos, servicios_profesionales}`.
- RPC: en `sb_lines`, si `coverage_end > coverage_start`, distribuir `subtotal` linealmente por días entre los meses cubiertos. En base cash mantener comportamiento por pago.
- Changelog v7.110.2.

### PL-04 · Daños en P&L + línea "Recuperación de daños" (v7.110.3)
- RPC `damage_by_month`: `COALESCE(actual_cost, estimated_cost, 0)` y fecha `COALESCE(repaired_at::date, created_at::date)`.
- Migración: `invoices.invoice_type text check IN ('standard','damage_charge') default 'standard'`.
- UI factura manual: checkbox "Es cargo por daños".
- Clasificación de ingresos: nueva línea "Ingresos por Recuperación de Daños" tras las 3 actuales, sumando a Total Ingresos (tipos, hooks, tabla, breakdowns, CSV, PDF).
- Changelog v7.110.3.

### PL-05 · Drill-down de egresos por categoría (v7.110.4)
- RPC devuelve `expense_detail` por mes: `{month, category, date, description, amount, source}` con misma dedup que `expense_lines` (incluir folio de bill cuando aplique).
- UI `IncomeStatementTable`: cada categoría de egreso clickeable → `Dialog` con detalle (fecha, descripción, monto, origen, folio). Respetar RLS/roles.
- Changelog v7.110.4.

## P2 — Presentación

### PL-06 · Etiquetas y base cash (v7.110.5)
- Renombrar línea final a "Utilidad Operativa Neta (antes de impuestos)" y margen correspondiente (tabla + PDF).
- Nota al pie en modo Efectivo explicando qué se reconoce por pago vs devengo.
- Extender warning `sold_without_cost` para incluir ventas facturadas sin cotización (mostrar factura).
- Changelog v7.110.5.

### PL-07 · Análisis vertical + gráfica (v7.110.6)
- Segunda columna % por fila (cada línea como % del Total Ingresos del mes).
- Gráfica arriba con `recharts` (consistente con `RevenueReport`): barras agrupadas Ingresos vs Egresos + línea Margen Neto %. Tooltips con moneda.
- Incluir ambas en PDF exportado.
- Changelog v7.110.6.

## DRIFT

### PL-08 · Backfill de migraciones (v7.110.7)
- Nueva migración `20260501000000_drift_backfill.sql` (fecha anterior a `20260515044551`) que cree idempotentemente:
  - `public.collection_reminders_log` (tabla + enable RLS + GRANTs mínimos).
  - `public.create_notification(uuid,text,text,text,text,text,uuid)` como stub `CREATE OR REPLACE`.
  - `public.notify_admins(text,text,text,text,text,uuid)` stub.
  - `public.notify_payment_received()` stub.
- Dejar intacta `20260720011916` (su `CREATE OR REPLACE` sobreescribe con la versión definitiva).
- Verificar `supabase db reset` (o secuencia completa) sin errores.
- Changelog v7.110.7.

## Detalles técnicos

- Todas las migraciones vía `supabase--migration` (una por issue, secuenciales — no en paralelo).
- Tras cada migración: actualizar hooks/tipos afectados (`useMonthlyData`, `types.ts`, `useStatementTotals`, `useStatementRows`, `IncomeStatementTable`, `ComparisonTable`, PDF export).
- Tests Vitest: extender `computeDerivedTotals.test.ts` para depreciación idle, ingresos negativos, invoice_type, prorrateo (donde toque lógica cliente); mocks para nuevas ramas de RPC no aplican, pero cubrir helpers.
- Cada cambio actualiza `public/changelog.json` (índice) + `public/changelog/v7.110.X.json` (detalle).
- Timezone `America/Monterrey`, formato es-MX, `formatMonthEs` para etiquetas.
- Respetar Power of 10: componentes ≤150 LOC, hooks ≤80, sin `any/!/as`, early returns.

## Orden de ejecución
1. PL-01 → PL-02 (ambos tocan `combined`/depreciación)
2. PL-03 → PL-04 (schema nuevo en bills/invoices)
3. PL-05 → PL-06 → PL-07 (UI/UX)
4. PL-08 (independiente, migración anti-drift)

## Fuera de alcance
- Backfill retroactivo de `damage_records` para devoluciones anteriores a v7.109.0.
- Sprint de higiene de historial de migraciones más allá de PL-08.
- Cambios en RLS/permisos de tablas existentes (solo GRANT mínimo en la nueva tabla si se requiere).
