## Objetivo
Agregar **Editar** y **Eliminar** a Facturas de Proveedor (`/cuentas-por-pagar`) con guardas estrictas para no romper integridad contable.

## Reglas de negocio

### Editar
- **Quién**: usuarios con permiso `Facturas de Proveedor: full` (admin / administrativo).
- **Cuándo**: la factura debe estar `approval_status = 'pending'` AND `status != 'cancelled'` AND `status != 'paid'` AND `payments.length === 0`. Una vez aprobada o con pagos, no se edita.
- **Qué se edita**: los mismos campos del alta — proveedor, categoría, descripción, fechas, moneda, tipo de cambio, montos (subtotal/IVA/retenciones), UUID, método SAT. `bill_number` se mantiene. `balance` se recalcula con el nuevo total.

### Eliminar
- **Quién**: solo rol `admin`.
- **Cuándo**: `payments.length === 0` AND `approval_status != 'approved'` AND `status != 'cancelled'`. Si está aprobada o cancelada, mejor cancelar (no borrar).
- **Acción**: `DELETE` físico de la fila. Las RLS ya permiten DELETE a admin/administrativo; restringimos a admin desde la UI. Triggers de auditoría existentes capturan el evento.
- **Confirmación**: `ConfirmDialog` con texto explícito ("Esta acción es irreversible") y el folio de la factura.

## Cambios

### 1. Hooks de mutaciones — `useSupplierBillMutations.ts`
Agregar:
- `useUpdateSupplierBill()`: `mutationFn({ id, patch })` → `update(patch)` + recalcular `total` y `balance` en cliente; invalida `SUPPLIER_BILLS_QK` y `["supplier_bill", id]`.
- `useDeleteSupplierBill()`: `mutationFn(id)` → `delete().eq("id", id)`; invalida queries; cierra el panel.

### 2. Formulario reutilizable — `useSupplierBillForm.ts` + `SupplierBillFormDialog.tsx`
- `useSupplierBillForm(open, onClose, initialBill?)`: si recibe `initialBill`, hace `form.reset()` con sus valores, y en `onSubmit` decide entre `create.mutate` o `update.mutate({ id, patch })`.
- `SupplierBillFormDialog`: prop opcional `bill?: SupplierBillDetail | null`. Si viene `bill`, título cambia a "Editar factura {bill_number}", botón a "Guardar cambios". Si no, alta normal.

### 3. Panel de detalle — `SupplierBillDetailSheet.tsx`
- Importar `useUserRole`, abrir state `editDialog` y `deleteDialog`.
- En el bloque `PaymentActions`, agregar dos botones nuevos:
  - **Editar** (ícono `Pencil`): visible si `canEdit = approval_status === 'pending' && status !== 'cancelled' && status !== 'paid' && payments.length === 0`. Disabled con tooltip cuando no aplique.
  - **Eliminar** (ícono `Trash2`, variant `destructive`): visible solo si `role === 'admin'`. Disabled con tooltip si no cumple `payments.length === 0 && approval_status !== 'approved' && status !== 'cancelled'`.
- Al hacer clic en Eliminar → `ConfirmDialog` ("¿Eliminar factura {bill_number}? Esta acción es irreversible y eliminará el registro de auditoría operativa. No se permite si la factura ya fue aprobada o tiene pagos.").
- Al hacer clic en Editar → abre `SupplierBillFormDialog` con `bill={bill}`. Al guardar, cierra el dialog y refresca el panel.

### 4. Visibilidad en la lista
- Sin cambios en la lista (la acción se hace desde el drill-down panel, en línea con el patrón del módulo).

### 5. Changelog
Nueva entrada `v6.82.0` (minor — nueva capacidad).

## Fuera de alcance
- No se cambia la cancelación existente (sigue como acción reversible para facturas aprobadas).
- No se edita la factura ya aprobada — solo borrador. Si en el futuro se necesita corregir aprobadas, se hará vía nota de cargo/crédito.
- Sin cambios en la BD: las RLS ya permiten UPDATE/DELETE a admin. El UI agrega la restricción de "admin only" para delete.
- No se agrega edición masiva.

## Detalles técnicos
- Archivos editados:
  - `src/features/accounts-payable/hooks/useSupplierBillMutations.ts` (+ 2 hooks).
  - `src/features/accounts-payable/hooks/useSupplierBillForm.ts` (acepta `initialBill?`, soporta update path).
  - `src/features/accounts-payable/components/SupplierBillFormDialog.tsx` (prop `bill?`, título/botón dinámicos).
  - `src/features/accounts-payable/components/SupplierBillDetailSheet.tsx` (botones Editar/Eliminar + diálogos).
- Archivos nuevos: ninguno (reuso de `ConfirmDialog` existente).
- Tests:
  - Extender `src/features/accounts-payable/hooks/__tests__/useSupplierBillMutations.test.ts` con casos de update y delete (mock de supabase chain).
- Changelog: `public/changelog/v6.82.0.json` + entry en `public/changelog.json`.
