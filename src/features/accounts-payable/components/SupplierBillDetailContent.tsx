import { useRef, type ReactNode } from "react";
import { StatusBadge } from "@/components/feedback/StatusBadge";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Separator } from "@/components/ui/separator";
import { RoleGuard } from "@/layouts/RoleGuard";
import { formatDateMty } from "@/lib/format/dateFormats";
import { formatCurrencyWithCode } from "@/lib/format/formatCurrency";
import {
  SUPPLIER_BILL_STATUS_LABELS,
  EXPENSE_CATEGORY_LABELS,
} from "../lib/supplierBillConstants";
import { BillApprovalSection } from "./BillApprovalSection";
import { CancelSupplierBillDialog } from "./CancelSupplierBillDialog";
import { RegisterSupplierPaymentDialog } from "./RegisterSupplierPaymentDialog";
import { SupplierBillFormDialog } from "./SupplierBillFormDialog";
import { SupplierBillHeaderActions } from "./SupplierBillHeaderActions";
import { SupplierBillPaymentActions } from "./SupplierBillPaymentActions";
import { SupplierPaymentRow } from "./SupplierPaymentRow";
import type { BillPermissions } from "../lib/billPermissions";

function Row({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,2fr)] gap-3 py-1.5 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="min-w-0 font-medium text-right [overflow-wrap:anywhere]">{value || "-"}</span>
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
  rejected_at?: string | null;

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
    <div className="space-y-2">
      <p className="text-base font-semibold [overflow-wrap:anywhere]">{bill.suppliers?.name || "-"}</p>
      <StatusBadge status={bill.status} label={SUPPLIER_BILL_STATUS_LABELS[bill.status as keyof typeof SUPPLIER_BILL_STATUS_LABELS]} />
    </div>
  );
}

function BillMetadataRows({ bill }: { bill: DetailBill }) {
  return (
    <div className="space-y-0">
      <Row label="RFC" value={bill.suppliers?.rfc} />
      <Row label="Categoría" value={bill.category ? EXPENSE_CATEGORY_LABELS[bill.category as keyof typeof EXPENSE_CATEGORY_LABELS] : "—"} />
      <Row label="Emisión" value={formatDateMty(bill.issue_date)} />
      <Row label="Vencimiento" value={formatDateMty(bill.due_date)} />
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
  const paymentTriggerRef = useRef<HTMLButtonElement>(null);
  const paymentSummaryRef = useRef<HTMLDivElement>(null);
  // Preserve the existing read-only balance: historical total minus applied payments.
  const paidSum = (bill.payments ?? []).reduce((sum, payment) => sum + Number(payment.amount), 0);
  const computedBalance = Math.max(0, Number(bill.total) - paidSum);
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4 space-y-4">
      <BillHeaderRow bill={bill} />
      <RoleGuard module="Facturas de Proveedor" minAccess="full" fallback={null}>
        <SupplierBillHeaderActions
          bill={bill}
          isAdmin={isAdmin}
          {...perms}
          onCancelClick={() => dialogs.setCancelDialog(true)}
          onEditClick={() => dialogs.setEditDialog(true)}
          onDeleteClick={() => dialogs.setDeleteDialog(true)}
        />
      </RoleGuard>
      <Separator />
      <BillMetadataRows bill={bill} />
      <Separator />
      <FinancialsSection bill={bill} />

      {bill.description && (
        <>
          <Separator />
          <div>
            <p className="text-xs text-muted-foreground mb-1">Descripción</p>
            <p className="text-sm whitespace-pre-wrap [overflow-wrap:anywhere]">{bill.description}</p>
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
        rejectedAt={bill.rejected_at ?? null}
      />


      </div>
      <div className="shrink-0 space-y-3 border-t bg-background px-6 pt-3 pb-[calc(1rem+env(safe-area-inset-bottom))]">
        <div ref={paymentSummaryRef} tabIndex={-1} role="region" aria-label={`Saldo de ${bill.bill_number}`} className="space-y-1">
          <p className="text-xs text-muted-foreground [overflow-wrap:anywhere]">{bill.bill_number}</p>
          <p className="text-xs text-muted-foreground" title="Calculado: total menos pagos registrados">Saldo (calculado) · {bill.currency}</p>
          <p className="text-xl font-bold tabular-nums [overflow-wrap:anywhere]">{formatCurrencyWithCode(computedBalance, bill.currency)}</p>
        </div>
        <RoleGuard module="Facturas de Proveedor" minAccess="full" fallback={null}>
        <SupplierBillPaymentActions
          bill={bill}
          paymentTriggerRef={paymentTriggerRef}
          onPayClick={() => dialogs.setPayDialog(true)}
        />
        </RoleGuard>
      </div>

      <RegisterSupplierPaymentDialog
        open={dialogs.payDialog}
        onOpenChange={dialogs.setPayDialog}
        billId={bill.id}
        billNumber={bill.bill_number}
        balance={Number(bill.balance)}
        currency={bill.currency ?? "MXN"}
        onCloseAutoFocus={(event) => {
          const target = paymentTriggerRef.current ?? paymentSummaryRef.current;
          if (target?.isConnected) {
            event.preventDefault();
            target.focus({ preventScroll: true });
          }
        }}
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
        description="Esta acción es irreversible y elimina el registro físico de la factura. No se permite si ya fue aprobada o tiene pagos. Si no tiene pagos, puedes cancelar el registro en el ERP."
        confirmLabel="Eliminar definitivamente"
        destructive
        onConfirm={onDelete}
      />
    </div>
  );
}
