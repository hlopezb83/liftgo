

# Agregar funcionalidad de eliminar cliente

## Resumen
Agregar un botón "Eliminar" en la página de detalle del cliente con confirmación via AlertDialog. Solo visible para admins. Validar que el cliente no tenga reservas o facturas activas antes de permitir la eliminación.

## Cambios

### `src/hooks/useCustomers.ts`
- Agregar hook `useDeleteCustomer` que ejecuta `supabase.from("customers").delete().eq("id", id)`

### `src/pages/CustomerDetailPage.tsx`
- Importar `useDeleteCustomer`, `AlertDialog` components, icono `Trash2`
- Agregar estado `deleteOpen` para el diálogo de confirmación
- Agregar botón "Eliminar" (rojo, solo para admin) en las acciones del header
- Validar antes de eliminar: si tiene reservas o facturas, mostrar advertencia y bloquear
- Al confirmar, ejecutar delete y navegar a `/customers`

### Flujo
1. Admin hace clic en "Eliminar"
2. Se abre AlertDialog: "¿Estás seguro? Esta acción no se puede deshacer."
3. Si el cliente tiene reservas/facturas, mostrar mensaje de que no se puede eliminar
4. Si no tiene dependencias, eliminar y redirigir a la lista

