

## Filtro por mes en Gastos Operativos

### Cambios en `src/pages/OperatingExpensesPage.tsx`

1. **Nuevo estado** `filterMonth` (default: mes actual en formato `"YYYY-MM"`, con opción `"all"` para todos).

2. **Generar lista de meses disponibles** a partir de los datos existentes usando `useMemo` — extraer valores únicos de `expense_date` (formato `YYYY-MM`), ordenados descendente.

3. **Nuevo `<Select>`** en la barra de filtros (junto al de categoría) con las opciones:
   - "Todos los meses"
   - Lista dinámica de meses con formato legible ("Mar 2026", "Feb 2026", etc.) usando `date-fns` + locale `es`.

4. **Agregar condición al filtro** en el `useMemo` de `filtered`: si `filterMonth !== "all"`, verificar que `e.expense_date.startsWith(filterMonth)`.

5. El total de la card de resumen ya se calcula sobre `filtered`, así que reflejará automáticamente el filtro de mes.

### Archivos
- `src/pages/OperatingExpensesPage.tsx`

