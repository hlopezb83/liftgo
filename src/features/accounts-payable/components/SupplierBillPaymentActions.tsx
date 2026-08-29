import { BlockedActionButton } from "@/components/feedback/BlockedActionButton";
import { CreditCard, ErrorIcon, EditIcon, DeleteIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { describeBusinessBlock } from "@/lib/rules/businessBlocks";
import type { BillPermissions } from "../lib/billPermissions";
import type { ReactNode } from "react";

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

function cancelBlock(bill: BillActionsState) {
  if (bill.status === "cancelled") return describeBusinessBlock("supplier_bill_cancelled");
  if (bill.payments.length > 0) return describeBusinessBlock("supplier_bill_has_payments");
  return null;
}

function GuardedButton({
  disabled, reason, children, onClick, variant = "default",
}: {
  disabled: boolean;
  reason: string | null;
  children: ReactNode;
  onClick: () => void;
  variant?: "default" | "outline" | "destructive";
}) {
  return (
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
  );
}

export function SupplierBillPaymentActions({
  bill, isAdmin, canEdit, canDelete, editBlock, deleteBlock,
  onPayClick, onCancelClick, onEditClick, onDeleteClick,
}: Props) {
  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <GuardedButton disabled={isPayBlocked(bill)} reason={payBlockReason(bill.approval_status)} onClick={onPayClick}>
          <CreditCard className="h-4 w-4 mr-1" /> Registrar pago
        </GuardedButton>
        <BlockedActionButton
          variant="outline"
          className="flex-1"
          block={cancelBlock(bill)}
          onClick={onCancelClick}
        >
          <ErrorIcon className="h-4 w-4 mr-1" /> Cancelar
        </BlockedActionButton>
      </div>
      <div className="flex gap-2">
        {/* La acción permanece visible y deshabilitada: el tooltip explica el
            motivo de negocio y el siguiente paso (los permisos se ocultan aparte). */}
        <BlockedActionButton
          variant="outline"
          className="flex-1"
          block={canEdit ? null : editBlock}
          onClick={onEditClick}
        >
          <EditIcon className="h-4 w-4 mr-1" /> Editar
        </BlockedActionButton>
        {isAdmin && (
          <BlockedActionButton
            variant="destructive"
            className="flex-1"
            block={canDelete ? null : deleteBlock}
            onClick={onDeleteClick}
          >
            <DeleteIcon className="h-4 w-4 mr-1" /> Eliminar
          </BlockedActionButton>
        )}
      </div>
    </div>
  );
}
