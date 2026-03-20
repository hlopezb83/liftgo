

## Cambios en la tabla de Gastos Operativos

Reemplazar la columna "Recurrente" por una columna "Proveedor" que muestre el nombre del proveedor vinculado.

### Cambios

**`src/hooks/useOperatingExpenses.ts`**
- Modificar la query de `useOperatingExpenses` para hacer join con suppliers: `.select("*, suppliers(name)")` en lugar de `select("*")`
- Actualizar la interfaz `OperatingExpense` para incluir `suppliers: { name: string } | null`

**`src/pages/OperatingExpensesPage.tsx`**
- En el `TableHeader`: reemplazar `<TableHead className="text-center">Recurrente</TableHead>` por `<TableHead>Proveedor</TableHead>`
- En el `TableBody`: reemplazar la celda de "Recurrente" (badge con icono Repeat) por una celda que muestre `e.suppliers?.name || "—"`
- Actualizar `colSpan` de `EmptyRow` si cambia el conteo de columnas (se mantiene en 6)
- Eliminar el import de `Repeat` si ya no se usa en ningún otro lugar

### Archivos a modificar
- `src/hooks/useOperatingExpenses.ts` (2 ediciones)
- `src/pages/OperatingExpensesPage.tsx` (3 ediciones menores)

