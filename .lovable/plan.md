## Bug
La factura `CXP-0118` tiene `approval_status = 'not_required'` (no requiere aprobación) y `status = 'overdue'`, sin pagos. Mi regla de Editar exigía `approval_status === 'pending'`, lo cual deja fuera las facturas marcadas como "No requiere aprobación".

## Fix
En `src/features/accounts-payable/components/SupplierBillDetailSheet.tsx`, relajar `canEdit`:

- **Antes**: `approval_status === "pending" && status !== "cancelled" && status !== "paid" && payments.length === 0`
- **Después**: `approval_status !== "approved" && approval_status !== "rejected" && status !== "cancelled" && status !== "paid" && payments.length === 0`

Es decir, una factura es editable cuando:
- La aprobación NO está resuelta (acepta `pending` y `not_required`).
- No está pagada ni cancelada (`overdue` y `pending` y `draft` y `partial` quedan dentro — pero `partial` ya queda bloqueado por la condición de pagos).
- No tiene pagos aplicados.

Ajustar también el `editBlockedReason` para que no muestre "Ya fue aprobada" en estados que ya no bloquean, y mantener los mensajes para `approved`, `rejected`, `paid`, `cancelled` y `tiene pagos`.

## Fuera de alcance
- No se cambia la lógica de Eliminar (ya aceptaba `not_required`).
- No se cambia la lógica de Cancelar / Registrar pago.
- Sin migraciones de BD.

## Changelog
Entrada `v6.83.1` (patch — bugfix).
