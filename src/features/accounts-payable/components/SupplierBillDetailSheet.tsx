import { useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { StatusBadge } from "@/components/feedback/StatusBadge";
import { RoleGuard } from "@/layouts/RoleGuard";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { formatCurrencyWithCode } from "@/lib/format/formatCurrency";
import { formatDateDisplay } from "@/lib/utils";
import { CreditCard, FileText, XCircle, Loader2, Pencil, Trash2 } from "lucide-react";
import { useSupplierBill } from "../hooks/useSupplierBill";
import { useDeleteSupplierBill } from "../hooks/useSupplierBillMutations";
import { useUserRole } from "@/features/users/hooks/useUserRole";
import {
  SUPPLIER_BILL_STATUS_LABELS,
  EXPENSE_CATEGORY_LABELS,
} from "../lib/supplierBillConstants";
import { RegisterSupplierPaymentDialog } from "./RegisterSupplierPaymentDialog";
import { CancelSupplierBillDialog } from "./CancelSupplierBillDialog";
import { SupplierBillFormDialog } from "./SupplierBillFormDialog";
import { BillApprovalSection } from "./BillApprovalSection";
import { SupplierPaymentRow } from "./SupplierPaymentRow";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface Props {
  billId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
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

interface BillActionsState {
  status: string;
  approval_status: string;
  payments: unknown[];
}

function PaymentActions({
  bill, isAdmin, canEdit, canDelete, editBlockedReason, deleteBlockedReason,
  onPayClick, onCancelClick, onEditClick, onDeleteClick,
}: {
  bill: BillActionsState;
  isAdmin: boolean;
  canEdit: boolean;
  canDelete: boolean;
  editBlockedReason: string | null;
  deleteBlockedReason: string | null;
  onPayClick: () => void;
  onCancelClick: () => void;
  onEditClick: () => void;
  onDeleteClick: () => void;
}) {
  const payBlocked =
    bill.status === "paid" ||
    bill.status === "cancelled" ||
    bill.approval_status === "pending" ||
    bill.approval_status === "rejected";
  const tooltipReason =
    bill.approval_status === "pending" ? "Requiere aprobación" :
    bill.approval_status === "rejected" ? "La factura fue rechazada" : null;
  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="flex-1">
                <Button className="w-full" disabled={payBlocked} onClick={onPayClick}>
                  <CreditCard className="h-4 w-4 mr-1" /> Registrar pago
                </Button>
              </span>
            </TooltipTrigger>
            {tooltipReason && <TooltipContent>{tooltipReason}</TooltipContent>}
          </Tooltip>
        </TooltipProvider>
        <Button variant="outline"
          disabled={bill.status === "cancelled" || bill.payments.length > 0}
          onClick={onCancelClick}>
          <XCircle className="h-4 w-4 mr-1" /> Cancelar
        </Button>
      </div>
      <div className="flex gap-2">
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="flex-1">
                <Button
                  variant="outline"
                  className="w-full"
                  disabled={!canEdit}
                  onClick={onEditClick}
                >
                  <Pencil className="h-4 w-4 mr-1" /> Editar
                </Button>
              </span>
            </TooltipTrigger>
            {!canEdit && editBlockedReason && <TooltipContent>{editBlockedReason}</TooltipContent>}
          </Tooltip>
        </TooltipProvider>
        {isAdmin && (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="flex-1">
                  <Button
                    variant="destructive"
                    className="w-full"
                    disabled={!canDelete}
                    onClick={onDeleteClick}
                  >
                    <Trash2 className="h-4 w-4 mr-1" /> Eliminar
                  </Button>
                </span>
              </TooltipTrigger>
              {!canDelete && deleteBlockedReason && <TooltipContent>{deleteBlockedReason}</TooltipContent>}
            </Tooltip>
          </TooltipProvider>
        )}
      </div>
    </div>
  );
}

export function SupplierBillDetailSheet({ billId, open, onOpenChange }: Props) {
  const { data: bill, isLoading } = useSupplierBill(open ? billId : null);
  const { data: role } = useUserRole();
  const deleteBill = useDeleteSupplierBill();
  const [payDialog, setPayDialog] = useState(false);
  const [cancelDialog, setCancelDialog] = useState(false);
  const [editDialog, setEditDialog] = useState(false);
  const [deleteDialog, setDeleteDialog] = useState(false);

  const isAdmin = role === "admin";
  const hasPayments = (bill?.payments?.length ?? 0) > 0;

  const canEdit = !!bill
    && bill.approval_status === "pending"
    && bill.status !== "cancelled"
    && bill.status !== "paid"
    && !hasPayments;
  const editBlockedReason = !bill ? null
    : bill.status === "cancelled" ? "Factura cancelada"
    : bill.status === "paid" ? "Factura pagada"
    : hasPayments ? "Tiene pagos registrados"
    : bill.approval_status === "approved" ? "Ya fue aprobada"
    : bill.approval_status === "rejected" ? "Fue rechazada"
    : null;

  const canDelete = !!bill
    && !hasPayments
    && bill.approval_status !== "approved"
    && bill.status !== "cancelled";
  const deleteBlockedReason = !bill ? null
    : hasPayments ? "Tiene pagos registrados"
    : bill.approval_status === "approved" ? "Ya fue aprobada — usa Cancelar"
    : bill.status === "cancelled" ? "Ya está cancelada"
    : null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            {bill?.bill_number ?? "Cargando…"}
          </SheetTitle>
        </SheetHeader>

        {isLoading || !bill ? (
          <div className="flex items-center justify-center py-12 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : (
          <div className="mt-4 space-y-4">
            <div className="flex items-center justify-between">
              <StatusBadge status={bill.status} label={SUPPLIER_BILL_STATUS_LABELS[bill.status]} />
              <div className="text-right">
                <p className="text-xs text-muted-foreground">Saldo</p>
                <p className="text-xl font-bold font-mono">{formatCurrencyWithCode(Number(bill.balance), bill.currency)}</p>
              </div>
            </div>

            <Separator />
            <div className="space-y-0">
              <Row label="Proveedor" value={bill.suppliers?.name} />
              <Row label="RFC" value={bill.suppliers?.rfc} />
              <Row label="Categoría" value={bill.category ? EXPENSE_CATEGORY_LABELS[bill.category] : "—"} />
              <Row label="Emisión" value={formatDateDisplay(bill.issue_date)} />
              <Row label="Vencimiento" value={formatDateDisplay(bill.due_date)} />
            </div>

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
            <div>
              <p className="text-xs font-semibold text-muted-foreground mb-2">
                Pagos aplicados ({bill.payments.length})
              </p>
              {bill.payments.length === 0 ? (
                <p className="text-sm text-muted-foreground italic">Sin pagos registrados</p>
              ) : (
                <div className="space-y-2">
                  {bill.payments.map((p) => (
                    <SupplierPaymentRow key={p.id} payment={p} billId={bill.id} currency={bill.currency} />
                  ))}
                </div>
              )}
            </div>

            <BillApprovalSection
              billId={bill.id}
              billNumber={bill.bill_number}
              approvalStatus={bill.approval_status}
              approvalNotes={bill.approval_notes}
              approvedAt={bill.approved_at}
            />

            <Separator />
            <RoleGuard module="Facturas de Proveedor" minAccess="full">
              <PaymentActions
                bill={bill}
                isAdmin={isAdmin}
                canEdit={canEdit}
                canDelete={canDelete}
                editBlockedReason={editBlockedReason}
                deleteBlockedReason={deleteBlockedReason}
                onPayClick={() => setPayDialog(true)}
                onCancelClick={() => setCancelDialog(true)}
                onEditClick={() => setEditDialog(true)}
                onDeleteClick={() => setDeleteDialog(true)}
              />
            </RoleGuard>

            <RegisterSupplierPaymentDialog
              open={payDialog}
              onOpenChange={setPayDialog}
              billId={bill.id}
              billNumber={bill.bill_number}
              balance={Number(bill.balance)}
            />
            <CancelSupplierBillDialog
              open={cancelDialog}
              onOpenChange={setCancelDialog}
              billId={bill.id}
              billNumber={bill.bill_number}
              onCancelled={() => onOpenChange(false)}
            />
            <SupplierBillFormDialog
              open={editDialog}
              onOpenChange={setEditDialog}
              bill={bill}
            />
            <ConfirmDialog
              open={deleteDialog}
              onOpenChange={setDeleteDialog}
              title={`Eliminar factura ${bill.bill_number}`}
              description="Esta acción es irreversible y elimina el registro físico de la factura. No se permite si ya fue aprobada o tiene pagos. Considera Cancelar en esos casos."
              confirmLabel="Eliminar definitivamente"
              destructive
              onConfirm={() => {
                deleteBill.mutate(bill.id, {
                  onSuccess: () => {
                    setDeleteDialog(false);
                    onOpenChange(false);
                  },
                });
              }}
            />
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
