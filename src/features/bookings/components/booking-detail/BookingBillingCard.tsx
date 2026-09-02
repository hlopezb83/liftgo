import { useState } from "react";
import { StatusBadge } from "@/components/feedback/StatusBadge";
import { InfoRow } from "@/components/forms/InfoRow";
import { ClockIcon } from "@/components/icons";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Switch } from "@/components/ui/switch";
import { getAccessLevel, useRolePermissions, useUserRole } from "@/features/users";
import { formatMtyDate } from "@/lib/utils";
import { useUpdateBooking } from "../../hooks/bookings/useBookingMutations";
import { RecurringBillingBadge } from "../bookings/RecurringBillingBadge";
import type { BookingWithForklift } from "../../hooks/bookings/useBookings";

/** Estados donde ya no tiene sentido cambiar la recurrencia (no habrá más ciclos). */
const CLOSED_STATUSES = new Set(["cancelled", "completed"]);

export function BookingBillingCard({ booking }: { booking: BookingWithForklift }) {
  const fmt = (d: string) => formatMtyDate(d);
  const { data: role } = useUserRole();
  const { data: perms } = useRolePermissions();
  const updateBooking = useUpdateBooking();
  const [disableConfirmOpen, setDisableConfirmOpen] = useState(false);

  const canEdit = !!perms && getAccessLevel(perms, role ?? undefined, "Reservas") === "full";
  const isClosed = CLOSED_STATUSES.has(booking.status);
  const canToggle = canEdit && !isClosed;

  const handleToggle = (next: boolean) => {
    if (!next) {
      setDisableConfirmOpen(true);
      return;
    }
    updateBooking.mutate({
      id: booking.id,
      recurring_billing: next,
      expectedVersion: booking.version,
    });
  };

  const disableRecurring = () => {
    updateBooking.mutate({
      id: booking.id,
      recurring_billing: false,
      expectedVersion: booking.version,
    }, { onSuccess: () => setDisableConfirmOpen(false) });
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <ClockIcon className="h-4 w-4 text-muted-foreground" /> Facturación
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <span className="text-sm text-muted-foreground">Facturación recurrente</span>
          <div className="flex items-center gap-2">
            {booking.recurring_billing ? (
              <RecurringBillingBadge booking={booking} />
            ) : (
              <span className="text-sm text-muted-foreground">No activa</span>
            )}
            {canToggle && (
              <Switch
                aria-label="Activar facturación recurrente mensual"
                checked={!!booking.recurring_billing}
                disabled={updateBooking.isPending}
                onCheckedChange={handleToggle}
              />
            )}
          </div>
        </div>
        {isClosed && booking.recurring_billing === false && (
          <p className="text-xs text-muted-foreground">
            La reserva ya está {booking.status === "cancelled" ? "cancelada" : "completada"}; la recurrencia ya no puede activarse.
          </p>
        )}
        {booking.last_billed_date && (
          <InfoRow label="Última facturación" value={fmt(booking.last_billed_date)} />
        )}
        {booking.return_status && (
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Estado de devolución</span>
            <StatusBadge status={booking.return_status} />
          </div>
        )}
      </CardContent>
      <ConfirmDialog
        open={disableConfirmOpen}
        onOpenChange={setDisableConfirmOpen}
        title="¿Desactivar la facturación recurrente?"
        description="Los periodos todavía no facturados dejarán de aparecer en el asistente recurrente. Las facturas ya creadas no cambian."
        confirmLabel="Desactivar recurrencia"
        destructive
        loading={updateBooking.isPending}
        onConfirm={disableRecurring}
      />
    </Card>
  );
}
