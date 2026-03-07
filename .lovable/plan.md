

## Plan: Separar Estado de Resultados por Año

### Concepto

Agregar un selector de año dentro del reporte de Estado de Resultados. En lugar de mostrar todos los meses del rango en una sola tabla, agrupar por año y mostrar solo los meses del año seleccionado. Incluir opción "Todos" para ver el comportamiento actual.

### Cambios

**Archivo: `src/components/reports/IncomeStatementReport.tsx`**

1. Agregar estado `selectedYear` con valores extraídos dinámicamente de los datos (ej: 2025, 2026)
2. Agregar un `Select` de año arriba de los KPIs con opciones: "Todos", "2025", "2026", etc.
3. Filtrar `data` por año seleccionado antes de calcular `totals`, `statementRows`, `chartData` y `csvRows`
4. Los KPIs, gráfica y tabla reflejan solo el año filtrado (o todos si se selecciona "Todos")

### Detalle técnico

- Extraer años únicos del array `data` usando `getYear()` del key `yyyy-MM`
- Crear `filteredData = selectedYear === "all" ? data : data.filter(d => d.month key starts with selectedYear)`
- Recalcular `totals` y `statementRows` basados en `filteredData` en vez de `data`
- El selector de año se renderiza dentro del `CardHeader` del reporte, junto al botón de exportar

### Changelog

**v3.16.2** — Filtro por año en Estado de Resultados

