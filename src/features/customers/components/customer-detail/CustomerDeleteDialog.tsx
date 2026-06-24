import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { formatCurrency } from "@/lib/format/formatCurrency";

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
  const hasActiveDeps = outstanding > 0;

  const descriptionNode = hasActiveDeps ? (
    <div className="space-y-2">
      <p className="font-medium text-destructive">No se puede archivar a {customerName}.</p>
      <p>Este cliente tiene:</p>
      <ul className="list-disc list-inside text-sm space-y-1 ml-2">
        <li className="text-destructive font-medium">Saldo pendiente: {formatCurrency(outstanding)}</li>
      </ul>
      <p className="text-xs text-muted-foreground pt-2">Liquida o cancela el saldo antes de archivar.</p>
    </div>
  ) : (
    <div className="space-y-2">
      <p>
        Se archivará a <strong>{customerName}</strong>: se ocultará de los listados pero
        se conservará todo su historial ({bookingsCount} reserva{bookingsCount === 1 ? "" : "s"},{" "}
        {invoicesCount} factura{invoicesCount === 1 ? "" : "s"}) para auditoría y reportes.
      </p>
      <p className="text-xs text-muted-foreground">Esta acción es reversible desde la base de datos.</p>
    </div>
  );

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      title="¿Archivar cliente?"
      descriptionNode={descriptionNode}
      confirmLabel="Archivar"
      destructive
      loading={isPending}
      hideConfirm={hasActiveDeps}
      onConfirm={onDelete}
    />
  );
}
