

# Plan: Reordenar Estado de Resultados

## Cambio
Mover "= Total de Egresos" arriba de "(-) Depreciación (Equipos Rentados)" y excluir la depreciación del total de egresos, ya que no es una salida de efectivo. El nuevo orden será:

```text
  ...gastos operativos...
  = Total Egresos          (sin depreciación)
  (-) Depreciación
  = Utilidad Neta
```

## Archivo: `src/components/reports/IncomeStatementReport.tsx`

### 1. `statementRows` (líneas ~288-297)
Reordenar: poner `= Total Egresos` (sin sumar depreciación) antes de `(-) Depreciación`, luego `= Utilidad Neta`.

### 2. `comparisonRows` (líneas ~268-272)
Mismo reorden: `= Total Egresos` (sin depreciación) antes de `(-) Depreciación`.

### 3. Cálculo de `totalExpenses`
En los 3 lugares donde se calcula (`data` línea ~172, `totals` línea ~213, `yearTotals` línea ~237): confirmar que `totalExpenses` ya NO incluye depreciación (actualmente no la incluye, solo se sumaba en la presentación). Solo ajustar las líneas de presentación que sumaban `+ depreciation` al mostrar el total.

