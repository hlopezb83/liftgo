

## Plan: Mejorar Estado de Resultados

### Mejoras propuestas

1. **Tarjetas resumen (KPIs)** en la parte superior: Ingresos totales, Total Egresos, Utilidad Neta, Margen Neto — con colores condicionales (verde/rojo)

2. **Gráfica de barras apiladas** que desglose los costos por categoría (mantenimiento, daños, renta, nómina, etc.) en lugar de un solo bloque "Costos"

3. **Subtotal de Utilidad Bruta** en la tabla: separar costos directos (mantenimiento + daños) de gastos operativos, mostrando una fila intermedia de "Utilidad Bruta" antes de los gastos operativos

4. **Mostrar todas las categorías de gastos** siempre (no solo cuando tienen valor > 0), para consistencia visual

5. **Fila de Total Egresos** explícita antes de Utilidad Neta

### Estructura de tabla mejorada

```text
Mes | Ingresos | Mantenimiento | Daños | Utilidad Bruta | Renta | Nómina | Software | Deprec. | Otros | Total Egresos | Utilidad Neta | Margen
```

### Cambios

1. **`src/components/reports/IncomeStatementReport.tsx`**
   - Agregar 4 tarjetas KPI con `Card` antes de la gráfica
   - Cambiar `BarChart` a barras apiladas por categoría de costo
   - Agregar columnas de Utilidad Bruta y Total Egresos a la tabla
   - Mostrar todas las categorías de gastos operativos siempre
   - Agregar `MonthRow.grossProfit` al cálculo

2. **`src/lib/changelog.ts`** — v3.15.1

