

## Quitar gráfica y reacomodar Estado de Resultados

### Cambios en `src/components/reports/IncomeStatementReport.tsx`

1. **Eliminar la gráfica BarChart** (líneas 586-637): Quitar el `<Card>` que contiene el chart. Los botones de año, CSV y PDF se mueven a una barra de controles independiente arriba de la tabla.

2. **Eliminar código muerto**: Quitar `chartData` (líneas 342-355) y los imports de recharts (`BarChart`, `Bar`, `XAxis`, `YAxis`, `Tooltip`, `ResponsiveContainer`, `Legend`).

3. **Nueva barra de controles**: Colocar el selector de año, botón CSV y botón PDF en un `div` con `flex justify-end` entre los KPIs y la tabla (o entre el alert y la tabla en modo comparativo). Título "Estado de Resultados" como `CardTitle` de la tabla.

### Layout resultante

```text
[Alert equipos sin costo (si aplica)]
[KPI Cards: Ingresos | Egresos | Utilidad | Margen]
[Barra: Selector año | CSV | PDF]
[Tabla Estado de Resultados]
```

### Archivos
- `src/components/reports/IncomeStatementReport.tsx`
- `src/lib/changelog.ts`

