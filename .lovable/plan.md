

# Plan: Depreciación de Equipos Rentados en Estado de Resultados

## Resumen
Agregar cálculo automático de depreciación mensual (costo de adquisición / 36 meses) solo para montacargas que tuvieron rentas activas en cada mes. Nueva fila "Depreciación (Equipos Rentados)" que se resta de la Utilidad Bruta para calcular la Utilidad Neta real.

---

## Cambios

### 1. ReportsPage.tsx
- Pasar `bookings` y `forklifts` como props adicionales al componente `IncomeStatementReport`

### 2. IncomeStatementReport.tsx

**Props:** Agregar `bookings: Tables<"bookings">[]` y `forklifts: Tables<"forklifts">[]`

**Lógica de depreciación (en el `useMemo` principal):**
- Para cada mes del reporte, identificar los `forklift_id` únicos que tenían bookings activos (status `confirmed` o `completed`, con `start_date <= fin_de_mes` y `end_date >= inicio_de_mes`)
- Para cada montacargas identificado, obtener su `acquisition_cost` y calcular `acquisition_cost / 36`
- Sumar todas las fracciones mensuales → `depreciation` del mes

**Nuevos campos en `MonthData`:** `depreciation: number`

**Nuevas filas en la tabla del estado de resultados:**
- Después de "= Utilidad Bruta" y "Margen Bruto", antes de los gastos operativos:
  - `(-) Depreciación (Equipos Rentados)` — con formato `isCost: true`

**Ajuste de Utilidad Neta:**
- `netProfit = revenue - totalExpenses - depreciation`
- `totalExpenses` sigue igual (mantenimiento + daños + costo_venta + opex)
- La depreciación se resta como concepto separado

**Afecta también:**
- `totals` (agregar `depreciation` acumulada)
- `yearTotals` para comparativo YoY
- `comparisonRows` (nueva fila de depreciación)
- `chartData` (agregar "Depr. Equipos" como barra)
- `netProfitChartData` (ya se beneficia del nuevo cálculo)
- CSV export rows
- PDF export rows
- KPIs summary

### 3. Changelog
- Nueva entrada v3.21.0

---

## Sección Técnica

- `acquisition_cost` está en la tabla `forklifts` (accesado como `(forklift as any).acquisition_cost` en otros componentes, lo que indica que puede no estar en los tipos autogenerados — se usará casting)
- La depreciación es línea recta: `acquisition_cost / 36` por mes, sin prorrateo parcial dentro del mes (si el equipo estuvo rentado cualquier día del mes, se cobra el mes completo)
- Montacargas sin `acquisition_cost` (null/0) se omiten del cálculo

