

## Permitir a admins editar facturas en cualquier estado

### Problema actual
El botón "Editar" en el detalle de factura (`InvoiceDetail.tsx`, línea ~120) solo se muestra cuando `invoice.status === "draft"`. Esto aplica a todos los roles, incluyendo admin. La ruta `/invoices/:id/edit` ya permite acceso a admin, dispatcher y administrativo.

### Cambios propuestos

**Archivo: `src/pages/InvoiceDetail.tsx`**

Modificar la condición del botón "Editar" en el menú de acciones (DropdownMenu):
- **Antes**: Solo visible si `status === "draft"`
- **Después**: Visible si `status === "draft"` O si el usuario tiene rol `admin`

Esto requiere importar `useUserRole` y verificar el rol del usuario actual.

**Archivo: `src/lib/changelog.ts`**
- Agregar entrada v3.6.2 patch documentando el cambio.

### Consideraciones
- Los admins podrán editar facturas en cualquier estado (sent, overdue, paid, partial)
- Si una factura tiene CFDI timbrado, el admin asume la responsabilidad de los cambios fiscales
- No se requieren cambios en la base de datos ni en las rutas, ya que el acceso a `/invoices/:id/edit` ya está habilitado para admins

