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
import { RecordPaymentDialog } from "@/features/invoices/components/invoices/RecordPaymentDialog";
import { CancelCfdiDialog } from "@/features/invoices/components/invoice-detail/CancelCfdiDialog";
import { CollectionNotesCard } from "@/features/invoices/components/invoice-detail/CollectionNotesCard";
import { NotesCard } from "@/components/NotesCard";

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
}: Props) {
  return (
    <>
      {notes && <NotesCard value={notes} readOnly />}
      {showCollectionNotes && <CollectionNotesCard invoiceId={invoiceId} />}
      <RecordPaymentDialog open={paymentOpen} onOpenChange={setPaymentOpen} invoiceId={invoiceId} balance={balance} />
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
