import { StatusBadge } from "@/components/feedback/StatusBadge";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Separator } from "@/components/ui/separator";
import { RoleGuard } from "@/layouts/RoleGuard";
import { formatCurrencyWithCode } from "@/lib/format/formatCurrency";
import { formatDateDisplay } from "@/lib/utils";
import {
  SUPPLIER_BILL_STATUS_LABELS,
  EXPENSE_CATEGORY_LABELS,
} from "../lib/supplierBillConstants";
import { BillApprovalSection } from "./BillApprovalSection";
import { CancelSupplierBillDialog } from "./CancelSupplierBillDialog";
import { RegisterSupplierPaymentDialog } from "./RegisterSupplierPaymentDialog";
import { SupplierBillFormDialog } from "./SupplierBillFormDialog";
import { SupplierBillPaymentActions } from "./SupplierBillPaymentActions";
import { SupplierPaymentRow } from "./SupplierPaymentRow";
import type { BillPermissions } from "../lib/billPermissions";
import type { ReactNode } from "react";

function Row({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 py-1.5 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium text-right break-words">{value || "—"}</span>
    </div>
  );
}

interface BillData {
  subtotal: number | string;
  tax_amount: number | string;
  retention_iva: number | string;
  retention_isr: number | string;
  total: number | string;
  exchange_rate: number | string | null;
  payment_method_sat: string | null;
  cfdi_uuid: string | null;
  currency: string;
}

function FinancialsSection({ bill }: { bill: BillData }) {
  return (
    <div className="space-y-0">
      <Row label="Subtotal" value={formatCurrencyWithCode(Number(bill.subtotal), bill.currency)} />
      <Row label="IVA" value={formatCurrencyWithCode(Number(bill.tax_amount), bill.currency)} />
      {Number(bill.retention_iva) > 0 && (
        <Row label="Ret. IVA" value={`-${formatCurrencyWithCode(Number(bill.retention_iva), bill.currency)}`} />
      )}
      {Number(bill.retention_isr) > 0 && (
        <Row label="Ret. ISR" value={`-${formatCurrencyWithCode(Number(bill.retention_isr), bill.currency)}`} />
      )}
      <Row label="Total" value={<strong>{formatCurrencyWithCode(Number(bill.total), bill.currency)}</strong>} />
      {bill.currency !== "MXN" && <Row label="Tipo de cambio" value={bill.exchange_rate} />}
      <Row label="Método SAT" value={bill.payment_method_sat} />
      <Row label="UUID" value={bill.cfdi_uuid ? <span className="font-mono text-xs">{bill.cfdi_uuid}</span> : "—"} />
    </div>
  );
}

interface DetailBill extends BillData {
  id: string;
  bill_number: string;
  status: string;
  approval_status: string;
  approval_notes: string | null;
  approved_at: string | null;
  balance: number | string;
  issue_date: string;
  due_date: string | null;
  description: string | null;
  category: string | null;
  suppliers: { name: string | null; rfc: string | null } | null;
  payments: Array<{ id: string; amount: number | string; [k: string]: unknown }>;
}

interface DialogsState {
  payDialog: boolean;
  setPayDialog: (o: boolean) => void;
  cancelDialog: boolean;
  setCancelDialog: (o: boolean) => void;
  editDialog: boolean;
  setEditDialog: (o: boolean) => void;
  deleteDialog: boolean;
  setDeleteDialog: (o: boolean) => void;
}

interface Props {
  bill: DetailBill;
  perms: BillPermissions;
  isAdmin: boolean;
  dialogs: DialogsState;
  onClose: () => void;
  onDelete: () => void;
}

function BillHeaderRow({ bill }: { bill: DetailBill }) {
  return (
    <div className="flex items-center justify-between">
      <StatusBadge status={bill.status} label={SUPPLIER_BILL_STATUS_LABELS[bill.status as keyof typeof SUPPLIER_BILL_STATUS_LABELS]} />
      <div className="text-right">
        <p className="text-xs text-muted-foreground">Saldo</p>
        <p className="text-xl font-bold font-mono">{formatCurrencyWithCode(Number(bill.balance), bill.currency)}</p>
      </div>
    </div>
  );
}

function BillMetadataRows({ bill }: { bill: DetailBill }) {
  return (
    <div className="space-y-0">
      <Row label="Proveedor" value={bill.suppliers?.name} />
      <Row label="RFC" value={bill.suppliers?.rfc} />
      <Row label="Categoría" value={bill.category ? EXPENSE_CATEGORY_LABELS[bill.category as keyof typeof EXPENSE_CATEGORY_LABELS] : "—"} />
      <Row label="Emisión" value={formatDateDisplay(bill.issue_date)} />
      <Row label="Vencimiento" value={formatDateDisplay(bill.due_date)} />
    </div>
  );
}

function PaymentsList({ bill }: { bill: DetailBill }) {
  return (
    <div>
      <p className="text-xs font-semibold text-muted-foreground mb-2">
        Pagos aplicados ({bill.payments.length})
      </p>
      {bill.payments.length === 0 ? (
        <p className="text-sm text-muted-foreground italic">Sin pagos registrados</p>
      ) : (
        <div className="space-y-2">
          {bill.payments.map((p) => (
            <SupplierPaymentRow key={p.id} payment={p as Parameters<typeof SupplierPaymentRow>[0]["payment"]} billId={bill.id} currency={bill.currency} billCancelled={bill.status === "cancelled"} />
          ))}
        </div>
      )}
    </div>
  );
}

export function SupplierBillDetailContent({ bill, perms, isAdmin, dialogs, onClose, onDelete }: Props) {
  return (
    <div className="mt-4 space-y-4">
      <BillHeaderRow bill={bill} />
      <Separator />
      <BillMetadataRows bill={bill} />
      <Separator />
      <FinancialsSection bill={bill} />

      {bill.description && (
        <>
          <Separator />
          <div>
            <p className="text-xs text-muted-foreground mb-1">Descripción</p>
            <p className="text-sm whitespace-pre-wrap">{bill.description}</p>
          </div>
        </>
      )}

      <Separator />
      <PaymentsList bill={bill} />

      <BillApprovalSection
        billId={bill.id}
        billNumber={bill.bill_number}
        approvalStatus={bill.approval_status as "approved" | "not_required" | "pending" | "rejected"}
        approvalNotes={bill.approval_notes}
        approvedAt={bill.approved_at}
      />

      <Separator />
      <RoleGuard module="Facturas de Proveedor" minAccess="full">
        <SupplierBillPaymentActions
          bill={bill}
          isAdmin={isAdmin}
          canEdit={perms.canEdit}
          canDelete={perms.canDelete}
          editBlockedReason={perms.editBlockedReason}
          deleteBlockedReason={perms.deleteBlockedReason}
          onPayClick={() => dialogs.setPayDialog(true)}
          onCancelClick={() => dialogs.setCancelDialog(true)}
          onEditClick={() => dialogs.setEditDialog(true)}
          onDeleteClick={() => dialogs.setDeleteDialog(true)}
        />
      </RoleGuard>

      <RegisterSupplierPaymentDialog
        open={dialogs.payDialog}
        onOpenChange={dialogs.setPayDialog}
        billId={bill.id}
        billNumber={bill.bill_number}
        balance={Number(bill.balance)}
      />
      <CancelSupplierBillDialog
        open={dialogs.cancelDialog}
        onOpenChange={dialogs.setCancelDialog}
        billId={bill.id}
        billNumber={bill.bill_number}
        onCancelled={onClose}
      />
      <SupplierBillFormDialog
        open={dialogs.editDialog}
        onOpenChange={dialogs.setEditDialog}
        bill={bill as Parameters<typeof SupplierBillFormDialog>[0]["bill"]}
      />
      <ConfirmDialog
        open={dialogs.deleteDialog}
        onOpenChange={dialogs.setDeleteDialog}
        title={`Eliminar factura ${bill.bill_number}`}
        description="Esta acción es irreversible y elimina el registro físico de la factura. No se permite si ya fue aprobada o tiene pagos. Considera Cancelar en esos casos."
        confirmLabel="Eliminar definitivamente"
        destructive
        onConfirm={onDelete}
      />
    </div>
  );
}
