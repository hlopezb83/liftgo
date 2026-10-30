import { BlockedActionButton } from "@/components/feedback/BlockedActionButton";
import { ErrorIcon, EditIcon, DeleteIcon } from "@/components/icons";
import { describeBusinessBlock } from "@/lib/rules/businessBlocks";
import type { BillPermissions } from "../lib/billPermissions";

interface Props extends BillPermissions {
  bill: { status: string; payments: unknown[] };
  isAdmin: boolean;
  onCancelClick: () => void;
  onEditClick: () => void;
  onDeleteClick: () => void;
}

export function SupplierBillHeaderActions({
  bill, isAdmin, canEdit, canDelete, editBlock, deleteBlock,
  onCancelClick, onEditClick, onDeleteClick,
}: Props) {
  const cancelBlock = bill.status === "cancelled"
    ? describeBusinessBlock("supplier_bill_cancelled")
    : bill.payments.length > 0 ? describeBusinessBlock("supplier_bill_has_payments") : null;

  return (
    <div className="flex flex-wrap gap-2" aria-label="Acciones de la factura">
      <BlockedActionButton variant="outline" size="sm" block={canEdit ? null : editBlock} onClick={onEditClick}>
        <EditIcon className="h-4 w-4 mr-1" /> Editar
      </BlockedActionButton>
      <BlockedActionButton variant="outline" size="sm" block={cancelBlock} onClick={onCancelClick}>
        <ErrorIcon className="h-4 w-4 mr-1" /> Cancelar registro
      </BlockedActionButton>
      {isAdmin && (
        <BlockedActionButton variant="destructive" size="sm" block={canDelete ? null : deleteBlock} onClick={onDeleteClick}>
          <DeleteIcon className="h-4 w-4 mr-1" /> Eliminar
        </BlockedActionButton>
      )}
    </div>
  );
}
