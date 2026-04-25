import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { formatCurrency } from "@/lib/formatCurrency";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  customerName: string;
  bookingsCount: number;
  invoicesCount: number;
  outstanding: number;
  isPending: boolean;
  onDelete: () => void;
}

export function CustomerDeleteDialog({
  open, onOpenChange, customerName, bookingsCount, invoicesCount, outstanding, isPending, onDelete,
}: Props) {
  const hasDependencies = bookingsCount > 0 || invoicesCount > 0;
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>¿Eliminar cliente?</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-2">
              {hasDependencies ? (
                <>
                  <p className="font-medium text-destructive">No se puede eliminar a {customerName}.</p>
                  <p>Este cliente tiene:</p>
                  <ul className="list-disc list-inside text-sm space-y-1 ml-2">
                    {bookingsCount > 0 && (
                      <li>{bookingsCount} reserva{bookingsCount === 1 ? "" : "s"} registrada{bookingsCount === 1 ? "" : "s"}</li>
                    )}
                    {invoicesCount > 0 && (
                      <li>{invoicesCount} factura{invoicesCount === 1 ? "" : "s"} emitida{invoicesCount === 1 ? "" : "s"}</li>
                    )}
                    {outstanding > 0 && (
                      <li className="text-destructive font-medium">Saldo pendiente: {formatCurrency(outstanding)}</li>
                    )}
                  </ul>
                  <p className="text-xs text-muted-foreground pt-2">Elimina o cancela primero las dependencias.</p>
                </>
              ) : (
                <p>
                  Esta acción no se puede deshacer. Se eliminará permanentemente
                  a <strong>{customerName}</strong> del sistema.
                </p>
              )}
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          {!hasDependencies && (
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={onDelete}
            >
              {isPending ? "Eliminando..." : "Eliminar"}
            </AlertDialogAction>
          )}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
