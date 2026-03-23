

## Drill-down en Gastos Operativos

Crear un panel lateral (Sheet) que se abra al hacer clic en una fila de la tabla, mostrando todos los detalles del gasto con opciones de editar y eliminar. Sigue el mismo patrón ya implementado en `MaintenanceDetailSheet`.

### Cambios

**1. Nuevo componente `src/components/expenses/ExpenseDetailSheet.tsx`**
- Panel lateral (Sheet) que muestra: categoría (Badge), monto, fecha, descripción, proveedor, si es recurrente, fechas de creación/actualización.
- Botones de "Editar" y "Eliminar" (con confirmación AlertDialog), protegidos con `RoleGuard`.
- Al presionar "Editar", cierra el sheet y abre el diálogo de edición existente.
- Al eliminar, ejecuta `deleteExpense` y cierra el sheet.

**2. `src/pages/OperatingExpensesPage.tsx`**
- Agregar estado `selectedExpense` para controlar el sheet de detalle.
- Hacer las filas de la tabla clickeables con `onClick={() => setSelectedExpense(e)}` y clase `cursor-pointer hover:bg-muted/50`.
- Mover los botones de editar/eliminar de las filas al sheet de detalle (limpiar la columna de acciones de la tabla).
- Renderizar `ExpenseDetailSheet` pasando el gasto seleccionado, y callbacks para editar/eliminar.

### Archivos
- `src/components/expenses/ExpenseDetailSheet.tsx` (nuevo)
- `src/pages/OperatingExpensesPage.tsx` (edición)

