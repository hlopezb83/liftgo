import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { format } from "date-fns";

import { useDelivery, useUpdateDelivery, useDeleteDelivery } from "@/hooks/useDeliveries";
import { useBookings } from "@/hooks/useBookings";
import { useForkliftMap } from "@/hooks/useForkliftMap";
import { DetailPageHeader } from "@/components/DetailPageHeader";
import { StatusBadge } from "@/components/StatusBadge";
import { RoleGuard } from "@/components/RoleGuard";
import { NotesCard } from "@/components/NotesCard";
import { SignaturePad } from "@/components/contracts/SignaturePad";
import { PostDeliveryPickupDialog } from "@/components/deliveries/PostDeliveryPickupDialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { CalendarDays, Truck, MapPin, CheckCircle, Trash2, User } from "lucide-react";
import { toast } from "sonner";
import { formatDateDisplay, parseDateLocal } from "@/lib/utils";

export default function DeliveryDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: delivery, isLoading } = useDelivery(id);
  const { data: bookings } = useBookings();
  const { forkliftMap } = useForkliftMap();
  const updateDelivery = useUpdateDelivery();
  const deleteDelivery = useDeleteDelivery();

  const [signatureOpen, setSignatureOpen] = useState(false);
  const [hoursReading, setHoursReading] = useState("");
  const [pickupPrompt, setPickupPrompt] = useState<{
    delivery: { forklift_id: string; booking_id: string | null; address: string | null; driver_name: string | null; driver_phone: string | null };
    bookingEndDate: string; forkliftName: string;
  } | null>(null);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-64" />
        <div className="grid gap-6 md:grid-cols-2"><Skeleton className="h-48" /><Skeleton className="h-48" /></div>
      </div>
    );
  }

  if (!delivery) {
    return <div className="flex flex-col items-center justify-center h-[60vh]"><p className="text-muted-foreground">Entrega no encontrada</p></div>;
  }

  const forklift = forkliftMap.get(delivery.forklift_id);

  const markComplete = (signatureBase64?: string) => {
    const hrs = hoursReading ? parseFloat(hoursReading) : undefined;
    updateDelivery.mutate(
      { id: delivery.id, status: "completed", completed_at: new Date().toISOString(), ...(signatureBase64 ? { signature_base64: signatureBase64 } : {}), ...(hrs !== undefined ? { hours_reading: hrs } : {}) },
      {
        onSuccess: () => {
          toast.success("Marcado como completado");
          setSignatureOpen(false);
          if (delivery.type === "delivery" && delivery.booking_id) {
            const booking = bookings?.find((b) => b.id === delivery.booking_id);
            if (booking && forklift) {
              setPickupPrompt({
                delivery: { forklift_id: delivery.forklift_id, booking_id: delivery.booking_id, address: delivery.address, driver_name: delivery.driver_name, driver_phone: delivery.driver_phone },
                bookingEndDate: booking.end_date, forkliftName: forklift.name,
              });
            }
          }
        },
      }
    );
  };

  const handleDelete = () => {
    deleteDelivery.mutate(delivery.id, {
      onSuccess: () => { toast.success("Entrega eliminada"); navigate("/deliveries"); },
    });
  };

  return (
    <>
      <div className="space-y-6">
        <DetailPageHeader
          title={delivery.delivery_number}
          subtitle={`${forklift?.name || "Equipo"} · ${delivery.type === "delivery" ? "Entrega" : "Recolección"}`}
          badges={<StatusBadge status={delivery.status} />}
          backTo="/deliveries"
          actions={
            <div className="flex gap-2">
              {delivery.status !== "completed" && (
                <Button size="sm" onClick={() => setSignatureOpen(true)}>
                  <CheckCircle className="h-4 w-4 mr-1" /> Completar
                </Button>
              )}
              <RoleGuard module="Entregas" minAccess="full">
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="outline" size="sm" className="text-destructive"><Trash2 className="h-4 w-4 mr-1" /> Eliminar</Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>¿Eliminar esta entrega?</AlertDialogTitle>
                      <AlertDialogDescription>Esta acción no se puede deshacer.</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancelar</AlertDialogCancel>
                      <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={handleDelete}>Eliminar</AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </RoleGuard>
            </div>
          }
        />

        <div className="grid gap-6 md:grid-cols-2">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2"><CalendarDays className="h-4 w-4 text-muted-foreground" />Tipo y Fecha</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <InfoRow label="Tipo" value={delivery.type === "delivery" ? "Entrega" : "Recolección"} />
              <InfoRow label="Fecha programada" value={formatDateDisplay(delivery.scheduled_date)} />
              {delivery.scheduled_time && <InfoRow label="Hora" value={delivery.scheduled_time} />}
              {delivery.completed_at && <InfoRow label="Completado" value={format(parseDateLocal(delivery.completed_at), "dd/MM/yyyy HH:mm")} />}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2"><Truck className="h-4 w-4 text-muted-foreground" />Equipo</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <InfoRow label="Nombre" value={forklift?.name || "—"} />
              <InfoRow label="Modelo" value={forklift?.model || "—"} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2"><MapPin className="h-4 w-4 text-muted-foreground" />Logística</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <InfoRow label="Dirección" value={delivery.address || "—"} />
              <InfoRow label="Operador" value={delivery.driver_name || "—"} />
              <InfoRow label="Teléfono" value={delivery.driver_phone || "—"} />
            </CardContent>
          </Card>

          {delivery.booking_id && (() => {
            const booking = bookings?.find((b) => b.id === delivery.booking_id);
            if (!booking) return null;
            return (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2"><User className="h-4 w-4 text-muted-foreground" />Reserva Vinculada</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <InfoRow label="Número" value={booking.booking_number} />
                  <InfoRow label="Cliente" value={booking.customer_name || "—"} />
                  <InfoRow label="Periodo" value={`${formatDateDisplay(booking.start_date)} → ${formatDateDisplay(booking.end_date)}`} />
                </CardContent>
              </Card>
            );
          })()}
        </div>

        {delivery.notes && <NotesCard value={delivery.notes} readOnly title="Notas" />}

        {delivery.signature_base64 && (
          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-base">Firma del Cliente</CardTitle></CardHeader>
            <CardContent>
              <img src={delivery.signature_base64} alt="Firma" className="max-h-32 border rounded-md bg-white" />
            </CardContent>
          </Card>
        )}
      </div>

      <Dialog open={signatureOpen} onOpenChange={setSignatureOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><CheckCircle className="h-5 w-5 text-primary" /> Firma del Cliente</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">Solicite la firma del cliente para confirmar la entrega.</p>
          <SignaturePad onSave={(base64) => markComplete(base64)} />
          <Button variant="link" size="sm" className="text-muted-foreground" onClick={() => markComplete()}>Omitir Firma</Button>
        </DialogContent>
      </Dialog>

      {pickupPrompt && (
        <PostDeliveryPickupDialog
          open={!!pickupPrompt}
          onOpenChange={(open) => { if (!open) setPickupPrompt(null); }}
          delivery={pickupPrompt.delivery}
          bookingEndDate={pickupPrompt.bookingEndDate}
          forkliftName={pickupPrompt.forkliftName}
        />
      )}
    </>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-sm font-medium text-right max-w-[60%]">{value}</span>
    </div>
  );
}
