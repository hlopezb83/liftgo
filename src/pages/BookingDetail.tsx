import { useParams, useNavigate } from "react-router-dom";
import { format, differenceInDays, parseISO } from "date-fns";

import { useBooking } from "@/hooks/useBookings";
import { DetailPageHeader } from "@/components/DetailPageHeader";
import { BookingActions } from "@/components/bookings/BookingActions";
import { RecurringBillingBadge } from "@/components/bookings/RecurringBillingBadge";
import { StatusBadge } from "@/components/StatusBadge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { CalendarDays, User, Truck, Clock, RotateCcw } from "lucide-react";

export default function BookingDetail() {
  const { id } = useParams<{ id: string }>();
  const { data: booking, isLoading } = useBooking(id);
  const navigate = useNavigate();

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-64" />
        <div className="grid gap-6 md:grid-cols-2">
          <Skeleton className="h-48" />
          <Skeleton className="h-48" />
        </div>
      </div>
    );
  }

  if (!booking) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] gap-4">
        <p className="text-muted-foreground">Reserva no encontrada</p>
      </div>
    );
  }

  const duration = differenceInDays(parseISO(booking.end_date), parseISO(booking.start_date));
  const formatDate = (d: string) => format(parseISO(d), "dd/MM/yyyy");

  return (
    <div className="space-y-6">
      <DetailPageHeader
        title={booking.forklifts?.name || "Reserva"}
        subtitle={booking.customer_name || "Sin cliente"}
        badges={<StatusBadge status={booking.status} />}
        backTo="/bookings"
        actions={<BookingActions booking={booking} />}
      />

      <div className="grid gap-6 md:grid-cols-2">
        {/* Datos del equipo */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Truck className="h-4 w-4 text-muted-foreground" />
              Equipo
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <InfoRow label="Nombre" value={booking.forklifts?.name || "—"} />
            <InfoRow label="Modelo" value={booking.forklifts?.model || "—"} />
          </CardContent>
        </Card>

        {/* Datos del cliente */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <User className="h-4 w-4 text-muted-foreground" />
              Cliente
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <InfoRow label="Nombre" value={booking.customer_name || "—"} />
            <InfoRow label="Contacto" value={booking.customer_contact || "—"} />
          </CardContent>
        </Card>

        {/* Fechas y duración */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <CalendarDays className="h-4 w-4 text-muted-foreground" />
              Periodo de Renta
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <InfoRow label="Fecha de inicio" value={formatDate(booking.start_date)} />
            <InfoRow label="Fecha de fin" value={formatDate(booking.end_date)} />
            <InfoRow label="Duración" value={`${duration} día${duration !== 1 ? "s" : ""}`} />
          </CardContent>
        </Card>

        {/* Facturación y estado */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Clock className="h-4 w-4 text-muted-foreground" />
              Facturación
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Facturación recurrente</span>
              <RecurringBillingBadge booking={booking} />
            </div>
            {booking.last_billed_date && (
              <InfoRow label="Última facturación" value={formatDate(booking.last_billed_date)} />
            )}
            {booking.return_status && (
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Estado de devolución</span>
                <StatusBadge status={booking.return_status} />
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-sm font-medium">{value}</span>
    </div>
  );
}
