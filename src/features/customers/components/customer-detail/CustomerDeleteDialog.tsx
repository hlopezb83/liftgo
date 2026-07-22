import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { formatCurrency } from "@/lib/format/formatCurrency";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  customerName: string;
  bookingsCount: number;
  invoicesCount: number;
  outstanding: number;
  /** Reservas activas (confirmed/active). Bloquean el archivado. R7-21.5. */
  activeBookingsCount: number;
  isPending: boolean;
  onDelete: () => void;
}

export function CustomerDeleteDialog({
  open, onOpenChange, customerName, bookingsCount, invoicesCount,
  outstanding, activeBookingsCount, isPending, onDelete,
}: Props) {
  const hasOutstanding = outstanding > 0;
  const hasActiveBookings = activeBookingsCount > 0;
  const blocked = hasOutstanding || hasActiveBookings;

  const descriptionNode = blocked ? (
    <div className="space-y-2">
      <p className="font-medium text-destructive">No se puede archivar a {customerName}.</p>
      <p>Este cliente tiene:</p>
      <ul className="list-disc list-inside text-sm space-y-1 ml-2">
        {hasOutstanding && (
          <li className="text-destructive font-medium">
            Saldo pendiente: {formatCurrency(outstanding)}
          </li>
        )}
        {hasActiveBookings && (
          <li className="text-destructive font-medium">
            {activeBookingsCount} reserva{activeBookingsCount === 1 ? "" : "s"} activa{activeBookingsCount === 1 ? "" : "s"}
          </li>
        )}
      </ul>
      <p className="text-xs text-muted-foreground pt-2">
        Liquida el saldo{hasActiveBookings ? " y cierra las reservas activas" : ""} antes de archivar.
      </p>
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
      hideConfirm={blocked}
      onConfirm={onDelete}
    />
  );
}
