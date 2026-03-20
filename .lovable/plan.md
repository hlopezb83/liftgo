

## Agregar categoría "Publicidad" a gastos operativos y estado de resultados

### Cambios necesarios

**1. Migración de base de datos**
Agregar el nuevo valor al enum `expense_category`:
```sql
ALTER TYPE public.expense_category ADD VALUE IF NOT EXISTS 'publicidad';
```

**2. `src/hooks/useOperatingExpenses.ts`**
- Agregar `"publicidad"` al tipo `ExpenseCategory`
- Agregar `publicidad: "Publicidad"` al objeto `EXPENSE_CATEGORY_LABELS`

**3. `src/components/reports/IncomeStatementReport.tsx`**
- Agregar `"publicidad"` al array `EXPENSE_CATEGORIES` (línea 30)
- Agregar `publicidad: 0` en los 3 inicializadores: `emptyExpenses()` (línea 114), `totals` (línea 247), `yearTotals` (línea 271)

### Archivos a modificar
- Migración SQL (1 línea)
- `src/hooks/useOperatingExpenses.ts` (2 ediciones)
- `src/components/reports/IncomeStatementReport.tsx` (4 ediciones)

