import { NotesCard } from "@/components/domain/NotesCard";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { RecordPaymentDialog } from "../invoices/RecordPaymentDialog";
import { CancelCfdiDialog } from "./CancelCfdiDialog";
import { CollectionNotesCard } from "./CollectionNotesCard";

type Props = {
  invoiceId: string;
  invoiceNumber: string;
  invoiceTotal: number;
  balance: number;
  notes: string | null;
  showCollectionNotes: boolean;
  paymentOpen: boolean;
  setPaymentOpen: (open: boolean) => void;
  cancelOpen: boolean;
  setCancelOpen: (open: boolean) => void;
  deleteOpen: boolean;
  setDeleteOpen: (open: boolean) => void;
  onCancelSuccess: () => void;
  onDelete: () => void;
  ppdStamped?: boolean;
};

export function InvoiceDetailDialogs({
  invoiceId,
  invoiceNumber,
  invoiceTotal,
  balance,
  notes,
  showCollectionNotes,
  paymentOpen,
  setPaymentOpen,
  cancelOpen,
  setCancelOpen,
  deleteOpen,
  setDeleteOpen,
  onCancelSuccess,
  onDelete,
  ppdStamped,
}: Props) {
  return (
    <>
      {notes && <NotesCard value={notes} readOnly />}
      {showCollectionNotes && <CollectionNotesCard invoiceId={invoiceId} />}
      <RecordPaymentDialog open={paymentOpen} onOpenChange={setPaymentOpen} invoiceId={invoiceId} balance={balance} ppdStamped={ppdStamped} />

      <CancelCfdiDialog open={cancelOpen} onOpenChange={setCancelOpen} invoiceId={invoiceId} invoiceTotal={invoiceTotal} onSuccess={onCancelSuccess} />
      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title={`¿Eliminar factura ${invoiceNumber}?`}
        description="Esta acción no se puede deshacer. Se eliminará la factura y sus datos asociados permanentemente."
        confirmLabel="Eliminar"
        destructive
        onConfirm={onDelete}
      />
    </>
  );
}
