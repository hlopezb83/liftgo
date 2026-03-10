

# Eliminar campo "Dirección de Facturación"

Remover el campo `billing_address` del formulario de cliente. La columna en la base de datos se mantiene (no rompe nada) pero se deja de usar en la UI.

## Cambios

### `src/components/CustomerFormDialog.tsx`
- Quitar `billing_address` del objeto `emptyCustomer`
- En la sección "Direcciones", quitar el grid de 2 columnas y dejar solo el campo "Dirección" a ancho completo
- Si la sección solo tiene un campo, simplificar el layout

### `src/lib/formSchemas.ts`
- Quitar `billing_address` del schema `customerFormSchema`

### `src/pages/CustomersPage.tsx`
- Quitar `billing_address` del objeto que se envía al crear cliente

### `src/pages/CustomerDetailPage.tsx`
- Quitar `billing_address` del objeto de actualización y del `editInitialData`

### `src/lib/changelog.ts`
- Registrar cambio en v3.26.1

