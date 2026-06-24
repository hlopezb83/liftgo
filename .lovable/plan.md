## Diagnóstico

Cuando se vende un montacargas:

- El ingreso entra correctamente en **Ingresos por Ventas**.
- Pero el **costo del activo (valor en libros remanente) no se descuenta** en ninguna línea del P&L. La depreciación deja de acumularse al vender, y el costo histórico nunca se reconoce como gasto.
- Resultado: la venta se ve 100% como utilidad y **infla la Utilidad Bruta y Neta**.

## Solución: nueva línea automática "(-) Costo de Equipos Vendidos"

Aplicada como costo directo (afecta Margen Bruto), justo arriba de "= Utilidad Bruta", con desglose por montacargas (igual que Depreciación e Ingresos).

### Fórmula del valor en libros al vender

```text
months_rented = meses con reserva confirmada/completada antes de la fecha de venta (cap 36)
depreciacion_acumulada = acquisition_cost × min(36, months_rented) / 36
valor_en_libros = max(0, acquisition_cost − depreciacion_acumulada)
```

El valor en libros se reconoce como COGS **en el mes de la venta** (fecha de venta = última entrada en `status_logs` con `to_status = 'sold'`).

## Cambios técnicos

1. **RPC `get_income_statement`** (migración):
   - Nuevos CTEs `sold_forklifts`, `sold_in_period`, `months_rented_per_sold`, `cogs_per_sold`, `cogs_by_month`.
   - El CTE `combined` agrega `cogs_forklift_sales` (número) y `cogs_by_forklift` (jsonb { nombre → valor }).
   - Sin cambios en firma, `SECURITY DEFINER`, `search_path`.

2. **`incomeStatement/types.ts`**:
   - `MonthData` y `YearTotals`: agregar `cogsForkliftSales: number` y `cogsByForklift: Record<string, number>` (solo MonthData).
   - `computeDerivedTotals`: restar `cogsForkliftSales` de `grossProfit` y sumarlo a `totalExpenses`.

3. **`useMonthlyData.ts`**: leer los nuevos campos del RPC y pasarlos a `computeDerivedTotals`.

4. **`useStatementTotals.ts`**: agregar `cogsForkliftSales` al reducer y a los totals iniciales.

5. **`statementRowFactories.ts`** (`buildStatementRows`): insertar la fila `(-) Costo de Equipos Vendidos` justo después de los direct cost rows y antes de `= Utilidad Bruta`.

6. **`useStatementRows.ts`**:
   - Agregar `cogsBreakdownRows` con `buildBreakdownRows(filteredData, m => m.cogsByForklift, true)`.
   - En `useComparisonRows` insertar la línea equivalente.

7. **`useIncomeStatementData.ts`** + **`IncomeStatementReport.tsx`** + **`IncomeStatementTable.tsx`**: propagar `cogsBreakdownRows`.

8. **`incomeStatementHelpers.ts`** (`getBreakdownFor`): mapear `(-) Costo de Equipos Vendidos` → `cogsBreakdownRows`.

9. **Changelog v6.91.0** (minor — nueva regla contable) en `public/changelog.json` + `public/changelog/v6.91.0.json`.

## Notas

- Cap de 36 meses respeta la regla de depreciación lineal existente.
- Forklifts vendidos sin `acquisition_cost` o sin `status_logs` quedan en $0 (sin COGS); aparecen igual que hoy en "rentados sin costo".
- No cambia el manejo manual de `costo_venta` en facturas de proveedor — si alguien quiere registrar costo adicional (transporte de la venta, comisión, etc.) lo sigue haciendo manual y se suma normalmente al bloque de Costo de Servicio.
- No requiere backfill: el cálculo es derivado, así que toda venta histórica aparece automáticamente con su COGS al refrescar el reporte.
