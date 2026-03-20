

## Homologar categorías de gastos operativos en el Estado de Resultados

### Problema

La categoría `caja_chica` se acumula en los datos mensuales (línea 114, `emptyExpenses()`) pero no está incluida en la constante `EXPENSE_CATEGORIES` (línea 30). Esto causa que:
1. No se muestre como línea en el reporte
2. No se sume al total de gastos operativos (`opexTotal`)
3. El cálculo de utilidad neta ignore esos montos

El mismo problema existe en los inicializadores de `totals` (línea 247) y `yearTotals` (línea 271), donde `caja_chica` no está en el objeto inicial.

### Plan

**Archivo: `src/components/reports/IncomeStatementReport.tsx`**

1. **Línea 30** — Agregar `"caja_chica"` al array `EXPENSE_CATEGORIES`:
   ```typescript
   const EXPENSE_CATEGORIES: ExpenseCategory[] = ["renta", "nomina", "software", "depreciacion", "caja_chica", "otro"];
   ```

2. **Línea 247** — Agregar `caja_chica: 0` al inicializador de `totals.expenses`.

3. **Línea 271** — Agregar `caja_chica: 0` al inicializador de `yearTotals.expenses`.

Con esto, "Caja Chica" aparecerá como línea de gasto operativo después del margen bruto, junto con Renta, Nómina, Software, Depreciación y Otro, y se incluirá correctamente en los totales y la utilidad neta.

### Archivos a modificar
- `src/components/reports/IncomeStatementReport.tsx` (3 ediciones menores)

