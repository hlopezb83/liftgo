import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { CreditCard, XCircle, Pencil, Trash2 } from "@/components/icons";
import type { BillPermissions } from "../lib/billPermissions";

interface BillActionsState {
  status: string;
  approval_status: string;
  payments: unknown[];
}

interface Props extends BillPermissions {
  bill: BillActionsState;
  isAdmin: boolean;
  onPayClick: () => void;
  onCancelClick: () => void;
  onEditClick: () => void;
  onDeleteClick: () => void;
}

function payBlockReason(approvalStatus: string): string | null {
  if (approvalStatus === "pending") return "Requiere aprobación";
  if (approvalStatus === "rejected") return "La factura fue rechazada";
  return null;
}

function isPayBlocked(bill: BillActionsState): boolean {
  return bill.status === "paid"
    || bill.status === "cancelled"
    || bill.approval_status === "pending"
    || bill.approval_status === "rejected";
}

function GuardedButton({
  disabled, reason, children, onClick, variant = "default",
}: {
  disabled: boolean;
  reason: string | null;
  children: React.ReactNode;
  onClick: () => void;
  variant?: "default" | "outline" | "destructive";
}) {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="flex-1">
            <Button variant={variant} className="w-full" disabled={disabled} onClick={onClick}>
              {children}
            </Button>
          </span>
        </TooltipTrigger>
        {reason && <TooltipContent>{reason}</TooltipContent>}
      </Tooltip>
    </TooltipProvider>
  );
}

export function SupplierBillPaymentActions({
  bill, isAdmin, canEdit, canDelete, editBlockedReason, deleteBlockedReason,
  onPayClick, onCancelClick, onEditClick, onDeleteClick,
}: Props) {
  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <GuardedButton disabled={isPayBlocked(bill)} reason={payBlockReason(bill.approval_status)} onClick={onPayClick}>
          <CreditCard className="h-4 w-4 mr-1" /> Registrar pago
        </GuardedButton>
        <Button variant="outline"
          disabled={bill.status === "cancelled" || bill.payments.length > 0}
          onClick={onCancelClick}>
          <XCircle className="h-4 w-4 mr-1" /> Cancelar
        </Button>
      </div>
      <div className="flex gap-2">
        <GuardedButton variant="outline" disabled={!canEdit} reason={!canEdit ? editBlockedReason : null} onClick={onEditClick}>
          <Pencil className="h-4 w-4 mr-1" /> Editar
        </GuardedButton>
        {isAdmin && (
          <GuardedButton variant="destructive" disabled={!canDelete} reason={!canDelete ? deleteBlockedReason : null} onClick={onDeleteClick}>
            <Trash2 className="h-4 w-4 mr-1" /> Eliminar
          </GuardedButton>
        )}
      </div>
    </div>
  );
}
