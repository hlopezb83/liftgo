## Auditoría v7.111.0 (PL-03 + PL-04)

**Verificación end-to-end**
- Migración `20260720031508`: tablas alteradas (`supplier_bills.coverage_start/end`, `damage_records.repaired_at`, `invoices.invoice_type`) + RPC `get_income_statement` reescrito con proración por días y `revenue_kind = 'damage_recovery'`.
- Frontend cableado completo: `MonthData` / `YearTotals` incluyen `revenueDamageRecovery` + `damageRecoveryByCustomer`; `statementRowFactories` inserta la fila "  Recuperación de Daños" antes del subtotal "= Total Ingresos"; `useStatementRows` construye breakdown por cliente; `IncomeStatementTable` recibe y expande el drill-down; `SupplierBillForm` acepta `coverage_start/end` con validación Zod (`superRefine`) y microcopy.
- Typecheck OK. Suite completa: **1080/1080 tests verdes** (14 archivos de reports/AP/PDF verificados en detalle).

**Bugs y gaps encontrados — todos menores, no bloqueantes**
1. Falta cobertura unitaria específica para las 2 lógicas nuevas:
   - `statementRowFactories.test.ts` no valida que la fila "Recuperación de Daños" aparezca en el orden correcto ni que `revenueDamageRecovery` se sume dentro del subtotal `revenue`.
   - `computeDerivedTotals` no tiene caso con `revenueDamageRecovery > 0` para confirmar que no se dobla-cuenta (el RPC ya lo suma en `revenue`, pero conviene fijar el invariante en test).
   - Zod `superRefine` de `coverage_start/end` no tiene test: cubrir "solo start" → error, "end < start" → error, ambos vacíos → OK, ambos válidos → OK.
2. La UI para marcar factura como `damage_charge` desde `InvoiceForm` sigue pendiente (documentado en el changelog). Hoy la clasificación depende de que el flag se ponga por API/import. No es un bug — es scope diferido.
3. Deduplicación `sb_lines ↔ operating_expenses` sigue usando `date_key = issue_date` + `amount_key = ROUND(amount, 2)`. Para bills prorateados, `amount_key` es la fracción mensual, así que **no puede colisionar** con la OE de subtotal completo — confirmado por lectura del CTE. Sin acción.

Conclusión: la fase pasada está estable. Continuamos con la siguiente.

---

## Siguiente fase — Sprint v7.112.0 (PL-05 → PL-07 + tests residuales)

### PL-05 · Drill-down de egresos por proveedor y descripción
Objetivo: al expandir una categoría de gasto en el Estado de Resultados, mostrar el detalle línea por línea (proveedor, descripción, monto).

- **RPC:** ampliar `get_income_statement` para devolver `expenses_detail_by_category[category] = [{ supplier, description, amount, date }]` por mes.
- **Types:** agregar `expensesDetailByCategory: Record<ExpenseCategory, Array<{supplier,description,amount,date}>>` en `MonthData` / `YearTotals`.
- **UI:** en `IncomeStatementTable`, hacer expandibles las filas de gastos (Renta, Nómina, Otro, etc.) mostrando el desglose. Reutilizar el patrón de `StatementTableRow` que ya soporta `breakdownRows`.

### PL-06 · Etiquetas de base contable (Devengado vs Efectivo)
Objetivo: dejar claro al usuario qué está viendo cuando cambia entre `accrual` / `cash`.

- Agregar `Badge` visible arriba de la tabla ("Base: Devengado" / "Base: Efectivo") con tooltip explicativo.
- En el título del PDF exportado, incluir la base: `Estado de Resultados — Base Devengado — Ene 2026 a Jul 2026`.
- En modo `cash`, ocultar/deshabilitar filas de Depreciación (no aplica) o marcarlas como "N/A".

### PL-07 · Análisis vertical + mini gráfica de tendencia
Objetivo: mostrar cada línea como % de ingresos totales y una sparkline por fila.

- **Análisis vertical:** para cada `StatementRow` no-porcentaje, calcular `value / totalRevenue * 100` y mostrarlo como columna extra "% Ingr." al lado del total. Toggle en la barra de acciones.
- **Sparkline:** columna adicional con mini gráfica (`recharts` `<LineChart>` mini o SVG inline) mostrando la evolución mes a mes. Solo visible cuando el rango cubre 3+ meses.

### Tests residuales de PL-03/PL-04
- `statementRowFactories.test.ts` — nuevo caso: fila "Recuperación de Daños" presente y `= Total Ingresos` incluye ese monto.
- `computeDerivedTotals.test.ts` — nuevo caso: `revenueDamageRecovery` participa correctamente en margen.
- `useSupplierBillForm` — nuevo archivo `useSupplierBillForm.coverage.test.ts` para validar el `superRefine`.

### Detalles técnicos
```text
public/changelog/v7.112.0.json
supabase/migrations/<new>_pl_05_expenses_detail.sql
src/features/reports/hooks/incomeStatement/types.ts          (+ expensesDetailByCategory)
src/features/reports/hooks/incomeStatement/useMonthlyData.ts (+ mapeo)
src/features/reports/components/reports/IncomeStatementTable.tsx  (+ drill-down egresos, toggle % vertical, sparkline)
src/features/reports/components/reports/IncomeStatementReport.tsx (+ Badge base contable, toggle vertical, ocultar dep en cash)
src/lib/pdf/documents/IncomeStatementDocument.tsx            (+ base en título)
src/features/reports/hooks/incomeStatement/__tests__/*.test.ts (+3 tests)
src/features/accounts-payable/hooks/__tests__/useSupplierBillForm.coverage.test.ts (+ nuevo)
```

Nada de business logic fuera de reports/AP; los cambios son aditivos y con feature flag implícito (toggles UI).
