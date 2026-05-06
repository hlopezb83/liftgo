## Objetivo

Agregar una nueva línea de subtotal **"= Utilidad antes de Depreciación"** en el Estado de Resultados, justo después de **Total Egresos** y antes de la fila de **Depreciación**. Esto da visibilidad de la utilidad operativa real (similar a EBITDA) antes de aplicar la deducción contable de depreciación.

## Cambios

### 1. Tipos y cálculo de totales (`src/hooks/incomeStatement/types.ts`)
- En `computeDerivedTotals` agregar campo derivado `profitBeforeDepreciation = revenue - totalExpenses` (sin restar depreciación).
- También calcular `marginBeforeDepreciation` (% sobre ingresos) por consistencia con Margen Bruto/Neto.
- Actualizar interfaces `MonthData` y `YearTotals` para incluir `profitBeforeDepreciation` y `marginBeforeDepreciation`.

### 2. Agregación (`src/hooks/incomeStatement/useStatementTotals.ts` y `useMonthlyData`)
- Asegurar que el nuevo campo se propague desde el cálculo mensual y desde la agregación anual.

### 3. Filas del reporte (`src/hooks/incomeStatement/statementRowFactories.ts`)
Modificar `buildStatementRows` para insertar después de `= Total Egresos` y antes de `(-) Depreciación`:
```
= Utilidad antes de Depreciación   (subtotal)
Margen antes de Depreciación        (porcentaje)
```

### 4. Vista comparativa (`src/hooks/incomeStatement/useStatementRows.ts`)
Insertar las mismas dos filas en el array de `useComparisonRows` en la misma posición.

### 5. PDF (sin cambios de código requeridos)
`src/lib/pdf/incomeStatement/rows.ts` itera filas genéricamente, así que las nuevas filas se renderizan automáticamente. Solo verificar que el ancho de columna siga cabiendo en A4 horizontal (ya tiene margen).

### 6. Changelog
- Crear `public/changelog/v5.59.5.json` y agregar entrada al inicio de `public/changelog.json` (patch: agrega visibilidad sin cambiar lógica fiscal).

## Resultado visual esperado

```
...
(-) Otros gastos
= Total Egresos
= Utilidad antes de Depreciación   ← NUEVO
Margen antes de Depreciación        ← NUEVO
(-) Depreciación (Equipos Rentados)
= Utilidad Neta
Margen Neto
```

## Notas

- No cambia el cálculo de Utilidad Neta ni de impuestos.
- Aparece en vista mensual, comparativa anual, CSV y PDF.
- Versión: **v5.59.5** (patch).
