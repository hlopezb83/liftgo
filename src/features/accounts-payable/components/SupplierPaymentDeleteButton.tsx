import { BlockedActionButton } from "@/components/feedback/BlockedActionButton";
import { DeleteIcon } from "@/components/icons";
import type { BusinessBlock } from "@/lib/rules/businessBlocks";

interface Props {
  canDelete: boolean;
  /** Bloqueo de negocio (REP recibido o factura cancelada). */
  deleteBlock: BusinessBlock | null;
  isPending: boolean;
  onClick: () => void;
}

export function SupplierPaymentDeleteButton({ canDelete, deleteBlock, isPending, onClick }: Props) {
  return (
    <div className="pt-1 flex justify-end">
      <BlockedActionButton
        size="sm"
        variant="ghost"
        className="h-7 px-2 text-destructive hover:text-destructive hover:bg-destructive/10"
        block={deleteBlock}
        disabled={!canDelete || isPending}
        onClick={onClick}
      >
        <DeleteIcon className="h-3 w-3 mr-1" /> Eliminar pago
      </BlockedActionButton>
    </div>
  );
}
