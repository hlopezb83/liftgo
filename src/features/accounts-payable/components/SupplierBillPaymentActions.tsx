import { BlockedActionButton } from "@/components/feedback/BlockedActionButton";
import { CreditCard, ErrorIcon, EditIcon, DeleteIcon } from "@/components/icons";
import { describeBusinessBlock } from "@/lib/rules/businessBlocks";
import { supplierBillPaymentBlock, type BillPermissions } from "../lib/billPermissions";

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

function cancelBlock(bill: BillActionsState) {
  if (bill.status === "cancelled") return describeBusinessBlock("supplier_bill_cancelled");
  if (bill.payments.length > 0) return describeBusinessBlock("supplier_bill_has_payments");
  return null;
}

export function SupplierBillPaymentActions({
  bill, isAdmin, canEdit, canDelete, editBlock, deleteBlock,
  onPayClick, onCancelClick, onEditClick, onDeleteClick,
}: Props) {
  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        {/* El estado del negocio (pagada, cancelada, sin aprobar o rechazada)
            deshabilita el pago pero mantiene la acción visible y explicada. */}
        <BlockedActionButton
          className="flex-1"
          block={supplierBillPaymentBlock(bill)}
          onClick={onPayClick}
        >
          <CreditCard className="h-4 w-4 mr-1" /> Registrar pago
        </BlockedActionButton>
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
