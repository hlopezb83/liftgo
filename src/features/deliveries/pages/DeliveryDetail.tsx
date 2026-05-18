import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { format } from "date-fns";

import { useDelivery, useDeliveries, useUpdateDelivery, useDeleteDelivery } from "@/features/deliveries/hooks/useDeliveries";
import { useBookings } from "@/features/bookings/hooks/useBookings";
import { useForkliftMap } from "@/features/fleet/hooks/forklifts/useForkliftMap";
import { DetailPageHeader } from "@/components/DetailPageHeader";
import { StatusBadge } from "@/components/StatusBadge";
import { NotesCard } from "@/components/NotesCard";
import { SignaturePad } from "@/features/contracts/components/contracts/SignaturePad";
import { PostDeliveryPickupDialog } from "@/features/deliveries/components/deliveries/PostDeliveryPickupDialog";
import {
  DeliveryStatusCard, DeliveryEquipmentCard, DeliveryLogisticsCard, DeliveryBookingCard,
} from "@/features/deliveries/components/deliveries/DeliveryInfoCards";
import { DeliveryActions } from "@/features/deliveries/components/deliveries/DeliveryActions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CheckCircle } from "lucide-react";
import { toast } from "sonner";
import { nowMty } from "@/lib/utils";

export default function DeliveryDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: delivery, isLoading } = useDelivery(id);
  const { data: siblingDeliveries } = useDeliveries(delivery?.booking_id ?? undefined);
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
  const linkedBooking = delivery.booking_id ? bookings?.find((b) => b.id === delivery.booking_id) : null;

  const hoursUsed = (() => {
    if (!delivery.booking_id || !siblingDeliveries) return null;
    const deliveryRecord = siblingDeliveries.find((d) => d.type === "delivery" && d.hours_reading != null);
    const pickupRecord = siblingDeliveries.find((d) => d.type === "pickup" && d.hours_reading != null);
    if (deliveryRecord?.hours_reading != null && pickupRecord?.hours_reading != null) {
      return Math.round((pickupRecord.hours_reading - deliveryRecord.hours_reading) * 10) / 10;
    }
    return null;
  })();

  const markComplete = (signatureBase64?: string) => {
    const hrs = hoursReading ? parseFloat(hoursReading) : undefined;
    updateDelivery.mutate(
      { id: delivery.id, status: "completed", completed_at: nowMty().toISOString(), ...(signatureBase64 ? { signature_base64: signatureBase64 } : {}), ...(hrs !== undefined ? { hours_reading: hrs } : {}) },
      {
        onSuccess: () => {
          toast.success("Marcado como completado");
          setSignatureOpen(false);
          if (delivery.type === "delivery" && delivery.booking_id && linkedBooking && forklift) {
            setPickupPrompt({
              delivery: { forklift_id: delivery.forklift_id, booking_id: delivery.booking_id, address: delivery.address, driver_name: delivery.driver_name, driver_phone: delivery.driver_phone },
              bookingEndDate: linkedBooking.end_date, forkliftName: forklift.name,
            });
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
            <DeliveryActions
              status={delivery.status}
              onComplete={() => setSignatureOpen(true)}
              onDelete={handleDelete}
            />
          }
        />

        <div className="grid gap-6 md:grid-cols-2">
          <DeliveryStatusCard
            type={delivery.type}
            scheduledDate={delivery.scheduled_date}
            scheduledTime={delivery.scheduled_time}
            completedAt={delivery.completed_at}
          />
          <DeliveryEquipmentCard
            forkliftName={forklift?.name}
            forkliftModel={forklift?.model}
            hoursReading={delivery.hours_reading}
            hoursUsed={hoursUsed}
          />
          <DeliveryLogisticsCard
            address={delivery.address}
            driverName={delivery.driver_name}
            driverPhone={delivery.driver_phone}
            transportCost={delivery.transport_cost}
            chargedToCustomer={delivery.charged_to_customer}
          />
          {linkedBooking && (
            <DeliveryBookingCard
              bookingNumber={linkedBooking.booking_number}
              customerName={linkedBooking.customer_name}
              startDate={linkedBooking.start_date}
              endDate={linkedBooking.end_date}
            />
          )}
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
          <div className="space-y-1.5">
            <Label htmlFor="hours-reading">Lectura de Horómetro (horas)</Label>
            <Input id="hours-reading" type="number" step="0.1" min="0" placeholder="Ej: 1250.5" value={hoursReading} onChange={(e) => setHoursReading(e.target.value)} />
          </div>
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
