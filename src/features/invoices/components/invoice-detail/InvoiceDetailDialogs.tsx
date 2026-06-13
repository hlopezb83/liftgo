import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { RecordPaymentDialog } from "../invoices/RecordPaymentDialog";
import { CancelCfdiDialog } from "./CancelCfdiDialog";
import { CollectionNotesCard } from "./CollectionNotesCard";
import { NotesCard } from "@/components/domain/NotesCard";

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
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar factura {invoiceNumber}?</AlertDialogTitle>
            <AlertDialogDescription>Esta acción no se puede deshacer. Se eliminará la factura y sus datos asociados permanentemente.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={onDelete}>
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
