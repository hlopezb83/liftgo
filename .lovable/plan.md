## Objetivo
Permitir **eliminar un pago** registrado en una Factura de Proveedor desde el panel de detalle, con guardas estrictas (la operación recalcula saldo/estado automáticamente vía trigger existente).

## Reglas de negocio

- **Quién**: solo rol `admin` (revertir un pago aplicado es operación contable sensible).
- **Cuándo NO se permite**:
  - El pago tiene un **REP aprobado** (`rep_status = 'approved'`) — debe revertirse primero el REP.
  - La factura está **cancelada** — no tiene sentido modificar pagos de una factura cancelada.
- **Cuándo se permite con advertencia explícita**:
  - El pago está **conciliado** con una línea bancaria. Borrar el pago dejará la línea bancaria como no conciliada (el FK `matched_supplier_payment_id` es `ON DELETE SET NULL`). El usuario debe confirmar explícitamente.
- **Qué pasa al eliminar**:
  - DELETE físico de la fila en `supplier_payments`.
  - El trigger `trg_sp_recalc_aiud` recalcula automáticamente `balance` y `status` de la factura (vuelve a `pending` / `partial` / `paid` según corresponda).
  - Las líneas bancarias conciliadas se desvinculan (FK SET NULL).
  - Auditoría: el trigger genérico de `supplier_payments` ya registra el cambio.

## Cambios

### 1. Nuevo hook — `useDeleteSupplierPayment.ts`
- `useMutation` que ejecuta `supabase.from("supplier_payments").delete().eq("id", paymentId)`.
- En `onSuccess` invalida:
  - `SUPPLIER_BILLS_QK`
  - `["supplier_bill", billId]`
  - `["accounts_payable_kpis"]`
  - `["reconciliation_status", "supplier:" + paymentId]`
  - Queries de líneas bancarias (`["bank_statement_lines"]`) por si se desvinculó alguna.
- `notifySuccess("Pago eliminado")` / `notifyError`.

### 2. UI — `SupplierPaymentRow.tsx`
- Importar `useDeleteSupplierPayment` y `useReconciliationStatus`.
- Solo si `role === "admin"`: agregar botón **Eliminar pago** (ícono `Trash2`, variant `ghost` destructivo, tamaño `sm`) en el footer del row.
- Botón deshabilitado con tooltip cuando:
  - `rep_status === "approved"` → "Revierte primero el REP fiscal".
  - factura `cancelled` → "La factura está cancelada".
- Al hacer clic → `ConfirmDialog` (destructivo) con:
  - Título: "Eliminar pago de {monto}".
  - Descripción: explicar que se recalculará el saldo y, si está conciliado, agregar línea adicional "Este pago está conciliado con {cuenta} el {fecha}. Al eliminarlo, la línea bancaria volverá a quedar sin conciliar."
  - Confirm: "Eliminar pago".

### 3. Bill status
- Sin cambios; los triggers existentes manejan `balance` y `status`.

### 4. Changelog
Nueva entrada `v6.83.0` (minor — nueva capacidad).

## Fuera de alcance
- No se permite editar un pago (si está mal, se elimina y se vuelve a registrar).
- No se toca el flujo de REP — si hay REP aprobado, primero se reinicia.
- No se desconcilia automáticamente la línea bancaria; queda lista para volver a conciliarse.
- Sin migraciones de BD (las RLS y triggers ya cubren el caso).

## Detalles técnicos
- Archivos nuevos: `src/features/accounts-payable/hooks/useDeleteSupplierPayment.ts`.
- Archivos editados: `src/features/accounts-payable/components/SupplierPaymentRow.tsx`.
- El componente necesita conocer si la factura está cancelada — agregar prop `billCancelled: boolean` desde `SupplierBillDetailSheet`.
- Changelog: `public/changelog/v6.83.0.json` + entry en `public/changelog.json`.
