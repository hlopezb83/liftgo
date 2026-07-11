import { format } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CalendarDays, FleetIcon, LocationIcon, CalendarIcon } from "@/components/icons";
import { formatDateDisplay, parseDateLocal, formatDateRange } from "@/lib/utils";
import { formatCurrency } from "@/lib/format/formatCurrency";

interface InfoRowProps { label: string; value: string }

function InfoRow({ label, value }: InfoRowProps) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-sm font-medium text-right max-w-[60%]">{value}</span>
    </div>
  );
}

interface DeliveryStatusCardProps {
  type: string;
  scheduledDate: string;
  scheduledTime: string | null;
  completedAt: string | null;
}

export function DeliveryStatusCard({ type, scheduledDate, scheduledTime, completedAt }: DeliveryStatusCardProps) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2"><CalendarDays className="h-4 w-4 text-muted-foreground" />Tipo y Fecha</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <InfoRow label="Tipo" value={type === "delivery" ? "Entrega" : "Recolección"} />
        <InfoRow label="Fecha programada" value={formatDateDisplay(scheduledDate)} />
        {scheduledTime && <InfoRow label="Hora" value={scheduledTime} />}
        {completedAt && <InfoRow label="Completado" value={format(parseDateLocal(completedAt), "dd/MM/yyyy HH:mm")} />}
      </CardContent>
    </Card>
  );
}

interface DeliveryEquipmentCardProps {
  forkliftName: string | undefined;
  forkliftModel: string | undefined;
  hoursReading: number | null;
  hoursUsed: number | null;
}

export function DeliveryEquipmentCard({ forkliftName, forkliftModel, hoursReading, hoursUsed }: DeliveryEquipmentCardProps) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2"><FleetIcon className="h-4 w-4 text-muted-foreground" />Equipo</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <InfoRow label="Nombre" value={forkliftName || "—"} />
        <InfoRow label="Modelo" value={forkliftModel || "—"} />
        {hoursReading != null && <InfoRow label="Horómetro" value={`${hoursReading} hrs`} />}
        {hoursUsed != null && (
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Horas Usadas</span>
            <span className="text-sm font-semibold text-primary">{hoursUsed} hrs</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

interface DeliveryLogisticsCardProps {
  address: string | null;
  driverName: string | null;
  driverPhone: string | null;
  transportCost: number | null;
  chargedToCustomer: boolean | null;
}

export function DeliveryLogisticsCard({ address, driverName, driverPhone, transportCost, chargedToCustomer }: DeliveryLogisticsCardProps) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2"><LocationIcon className="h-4 w-4 text-muted-foreground" />Logística</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <InfoRow label="Dirección" value={address || "—"} />
        <InfoRow label="Operador" value={driverName || "—"} />
        <InfoRow label="Teléfono" value={driverPhone || "—"} />
        {(transportCost ?? 0) > 0 && (
          <InfoRow label="Costo de flete" value={formatCurrency(Number(transportCost))} />
        )}
        {chargedToCustomer && (
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Cobrado al cliente</span>
            <span className="text-sm font-medium text-status-available">Sí</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

interface DeliveryBookingCardProps {
  bookingNumber: string;
  customerName: string | null;
  startDate: string;
  endDate: string;
}

export function DeliveryBookingCard({ bookingNumber, customerName, startDate, endDate }: DeliveryBookingCardProps) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2"><CalendarIcon className="h-4 w-4 text-muted-foreground" />Reserva Vinculada</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <InfoRow label="Número" value={bookingNumber} />
        <InfoRow label="Cliente" value={customerName || "—"} />
        <InfoRow label="Periodo" value={`${formatDateRange(startDate, endDate)}`} />
      </CardContent>
    </Card>
  );
}
