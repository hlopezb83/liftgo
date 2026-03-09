
# Plan: Mostrar todos los meses del rango seleccionado

## Problema
Actualmente, el reporte solo muestra columnas para meses que tienen datos. Si seleccionas "Octubre 2025 hasta Diciembre 2025" pero Diciembre no tiene transacciones, no aparece.

## Solución

### `src/components/reports/IncomeStatementReport.tsx`
- Al inicio del `useMemo` de `data`, pre-poblar el objeto `months` con **todos los meses** entre `startDate` y `endDate` (usando `eachMonthOfInterval` de `date-fns`)
- Cada mes se inicializa con valores en cero
- Así siempre aparecen todos los meses del rango, tengan o no datos

### `src/lib/changelog.ts`
- Entrada v3.22.2: "Corrección: el Estado de Resultados ahora muestra todos los meses del rango seleccionado, incluso sin datos"
