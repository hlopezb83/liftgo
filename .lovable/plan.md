

## Distinguir Ingresos por Rentas vs Ventas en el Estado de Resultados

### Contexto
Las facturas de venta tienen `booking_id = null` y las de renta tienen `booking_id` asignado. Actualmente todo se agrupa en una sola línea "Ingresos".

### Cambios en `src/components/reports/IncomeStatementReport.tsx`

**1. Ampliar `MonthData`** para incluir `revenueRental` y `revenueSales` además de `revenue` (que sigue siendo el total).

**2. Modificar el bucle de invoices** (líneas 115-121) para clasificar cada factura:
- Si `booking_id` existe → `revenueRental`
- Si `booking_id` es null → `revenueSales`
- `revenue` = suma de ambos

**3. Actualizar `totals`** para acumular ambas sub-categorías.

**4. Actualizar `statementRows`** para mostrar:
```text
  Ingresos por Rentas        ...
  Ingresos por Ventas         ...
= Total Ingresos             ...   (subtotal, negrita)
(-) Mantenimiento             ...
...
```

**5. Actualizar `comparisonRows`** (YoY) con la misma estructura de 3 líneas de ingresos.

**6. Actualizar `YearTotals`** para incluir `revenueRental` y `revenueSales`.

**7. Actualizar KPIs** — el KPI de "Ingresos" sigue mostrando el total, sin cambios.

**8. Actualizar `chartData`** para separar "Ingresos Rentas" e "Ingresos Ventas" en el gráfico de barras.

### Archivos a modificar
- `src/components/reports/IncomeStatementReport.tsx`

