import { BlockedActionNotice } from "@/components/feedback/BlockedActionNotice";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { formatCurrency } from "@/lib/format/formatCurrency";
import { type BusinessBlock, describeBusinessBlock } from "@/lib/rules/businessBlocks";

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
  /** Bloqueo devuelto por el backend (carrera: saldo/reservas cambiaron). */
  serverBlock?: BusinessBlock | null;
  onDelete: () => void;
}

export function CustomerDeleteDialog({
  open, onOpenChange, customerName, bookingsCount, invoicesCount,
  outstanding, activeBookingsCount, isPending, serverBlock, onDelete,
}: Props) {
  // Misma tolerancia monetaria que el backend (`customer_has_outstanding_balance`).
  const hasOutstanding = outstanding > 0.01;
  const outstandingBlock = describeBusinessBlock("customer_outstanding_balance");
  const hasActiveBookings = activeBookingsCount > 0;
  const blocked = hasOutstanding || hasActiveBookings;

  const descriptionNode = blocked ? (
    <div className="space-y-2">
      <p className="font-medium text-destructive">No se puede archivar a {customerName}.</p>
      <p>Este cliente tiene:</p>
      <ul className="list-disc list-inside text-sm space-y-1 ml-2">
        {hasOutstanding && (
          <li className="text-destructive font-medium">
            {outstandingBlock.reason} Saldo: {formatCurrency(outstanding)}
          </li>
        )}
        {hasActiveBookings && (
          <li className="text-destructive font-medium">
            {activeBookingsCount} reserva{activeBookingsCount === 1 ? "" : "s"} activa{activeBookingsCount === 1 ? "" : "s"}
          </li>
        )}
      </ul>
      <p className="text-xs text-muted-foreground pt-2">
        {hasOutstanding
          ? outstandingBlock.nextStep
          : "Cierra las reservas activas antes de archivar."}
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

  const description = serverBlock ? (
    <div className="space-y-2">
      <BlockedActionNotice block={serverBlock} />
    </div>
  ) : descriptionNode;

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      title="¿Archivar cliente?"
      descriptionNode={description}
      confirmLabel="Archivar"
      destructive
      loading={isPending}
      hideConfirm={blocked || !!serverBlock}
      onConfirm={onDelete}
    />
  );
}
