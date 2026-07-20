## Auditoría de fase pasada (v7.110.0 – v7.110.2)

Revisión completa: **47/47 tests verdes** (reports + PDF smoke). Wiring de `depreciation_rented`/`depreciation_idle` correcto en RPC, tipos, aggregate en `useStatementTotals`, filas del statement, filas de comparación y PDF (via `statementRows`). Fixtures actualizadas. Sin bugs detectados. Falta cobertura explícita del split de depreciación pero es opcional — se agrega en esta fase.

## Siguiente fase: PL-03 y PL-04 (P1)

### PL-03 — Prorrateo de gastos con cobertura

**DB (una migración):**
- `ALTER TABLE public.supplier_bills ADD COLUMN coverage_start date`, `coverage_end date` (NULL).
- Reescribir CTE `sb_lines` en `get_income_statement`: cuando `coverage_start` y `coverage_end` son válidos (end > start) y estamos en base `accrual`, distribuir `subtotal` linealmente por días entre los meses cubiertos. Base `cash` sin cambios (sigue por pago).

**Frontend:**
- En el formulario de CxP (SupplierBillForm): dos `DateField` "Inicio de cobertura" / "Fin de cobertura", visibles solo si `category ∈ {seguros_equipo, seguros_gastos, servicios_profesionales, honorarios}`.
- Zod: ambos opcionales, si uno está, requerir el otro; `end > start`.
- Tests: unit test del helper de prorrateo por días (calcula fracción esperada por mes cubierto).

### PL-04 — Daños en P&L + línea "Recuperación de daños"

**DB:**
- CTE `damage_by_month`: `COALESCE(actual_cost, estimated_cost, 0)`, fecha `COALESCE(repaired_at::date, created_at::date)`.
- `ALTER TABLE public.invoices ADD COLUMN invoice_type text DEFAULT 'standard' CHECK (invoice_type IN ('standard','damage_charge'))`.
- Clasificación de ingresos: facturas `damage_charge` → nueva línea `revenue_damage_recovery` (excluida de rentas/ventas), suma a `revenue`.

**Frontend:**
- `MonthData` / `YearTotals` / `RpcMonthRow`: nuevo campo `revenueDamageRecovery`.
- Nueva fila "  Ingresos por Recuperación de Daños" en `buildStatementRows` y en `useComparisonRows`, después de "Ventas de Equipo", antes de "= Total Ingresos".
- Formulario de nueva factura manual: checkbox "Es cargo por daños" → setea `invoice_type='damage_charge'`.
- Actualizar `IncomeStatementTable`, `IncomeStatementDocument` (PDF), `pdfFixtures.ts`, `computeDerivedTotals.test.ts`.

### Changelogs
- `public/changelog/v7.110.3.json` (PL-03) y `v7.110.4.json` (PL-04), actualizar `public/changelog.json`.

### Criterios de aceptación
- Factura 58,000 con cobertura 2026-07-01→2027-06-30 aporta ≈4,833.33/mes en accrual.
- Facturas sin cobertura se comportan igual que antes.
- Daño con `actual_cost=NULL` y `estimated_cost=4,500` aparece en `damage_cost` del mes reportado.
- Factura marcada como cargo por daños suma en "Recuperación de Daños", no en "Ventas".
- Todos los tests siguen verdes.

PL-05 (drill-down), PL-06 (etiquetas + base cash) y PL-07 (análisis vertical + gráfica) quedan para la siguiente ronda.