import { useParams } from "react-router-dom";
import { format } from "date-fns";

import { useReturnInspection } from "@/hooks/useReturnInspections";
import { DetailPageHeader } from "@/components/DetailPageHeader";
import { StatusBadge } from "@/components/StatusBadge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Truck, User, ClipboardCheck, AlertTriangle, Fuel, Clock } from "lucide-react";
import { parseDateLocal, formatDateDisplay } from "@/lib/utils";
import { formatCurrency } from "@/lib/formatCurrency";
import { STATUS_LABELS, FUEL_LEVEL_LABELS } from "@/lib/constants";
import type { ReturnInspectionWithJoins } from "@/types/rental";

export default function ReturnInspectionDetail() {
  const { id } = useParams<{ id: string }>();
  const { data: rawInspection, isLoading } = useReturnInspection(id);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-64" />
        <div className="grid gap-6 md:grid-cols-2"><Skeleton className="h-48" /><Skeleton className="h-48" /></div>
      </div>
    );
  }

  if (!rawInspection) {
    return <div className="flex flex-col items-center justify-center h-[60vh]"><p className="text-muted-foreground">Devolución no encontrada</p></div>;
  }

  const ins = rawInspection as ReturnInspectionWithJoins;

  return (
    <div className="space-y-6">
      <DetailPageHeader
        title={ins.inspection_number}
        subtitle={`${ins.forklifts?.name || "Equipo"} · ${ins.bookings?.customer_name || "Sin cliente"}`}
        badges={<StatusBadge status={ins.condition} />}
        backTo="/returns"
      />

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2"><Truck className="h-4 w-4 text-muted-foreground" />Equipo</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <InfoRow label="Nombre" value={ins.forklifts?.name || "—"} />
            <InfoRow label="Modelo" value={ins.forklifts?.model || "—"} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2"><User className="h-4 w-4 text-muted-foreground" />Reserva</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <InfoRow label="Cliente" value={ins.bookings?.customer_name || "—"} />
            {ins.bookings?.start_date && ins.bookings?.end_date && (
              <InfoRow label="Periodo" value={`${formatDateDisplay(ins.bookings.start_date)} → ${formatDateDisplay(ins.bookings.end_date)}`} />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2"><ClipboardCheck className="h-4 w-4 text-muted-foreground" />Inspección</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <InfoRow label="Fecha" value={format(parseDateLocal(ins.inspected_at), "dd/MM/yyyy HH:mm")} />
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Condición</span>
              <StatusBadge status={ins.condition} />
            </div>
            <InfoRow label="Inspector" value={ins.inspected_by || "—"} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2"><Fuel className="h-4 w-4 text-muted-foreground" />Uso y Combustible</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <InfoRow label="Horas de uso" value={ins.hours_used != null ? `${ins.hours_used} hrs` : "—"} />
            <InfoRow label="Nivel de combustible" value={ins.fuel_level ? (FUEL_LEVEL_LABELS[ins.fuel_level] || ins.fuel_level) : "—"} />
          </CardContent>
        </Card>

        {(ins.damage_notes || (ins.damage_cost && ins.damage_cost > 0)) && (
          <Card className="md:col-span-2">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-destructive" />Daños</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {ins.damage_notes && (
                <div>
                  <span className="text-sm text-muted-foreground">Notas de daños</span>
                  <p className="text-sm mt-1 whitespace-pre-wrap">{ins.damage_notes}</p>
                </div>
              )}
              {ins.damage_cost != null && ins.damage_cost > 0 && (
                <InfoRow label="Costo por daños" value={formatCurrency(ins.damage_cost)} />
              )}
            </CardContent>
          </Card>
        )}
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
