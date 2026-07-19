import { useState } from "react";
import { useParams } from "react-router";
import { NotesCard } from "@/components/domain/NotesCard";
import { StatusBadge } from "@/components/feedback/StatusBadge";
import { DetailPageHeader } from "@/components/layout/DetailPageHeader";
import { PageContainer } from "@/components/layout/PageContainer";
import { Skeleton } from "@/components/ui/skeleton";
import { useBookings } from "@/features/bookings";
import { useForkliftMap } from "@/features/fleet";
import { useNavigateTransition } from "@/hooks/useNavigateTransition";
import { notifySuccess } from "@/lib/ui/appFeedback";
import { nowMty } from "@/lib/utils";
import { DeliveryActions } from "../components/deliveries/DeliveryActions";
import { DeliveryDetailDialogs } from "../components/deliveries/DeliveryDetailDialogs";
import {
  DeliveryStatusCard, DeliveryEquipmentCard, DeliveryLogisticsCard, DeliveryBookingCard,
} from "../components/deliveries/DeliveryInfoCards";
import { DeliverySignatureCard } from "../components/deliveries/DeliverySignatureCard";
import { useDelivery, useDeliveries, useUpdateDelivery, useDeleteDelivery } from "../hooks/useDeliveries";
import { buildCompletionPayload, buildDeliverySubtitle, computeHoursUsed } from "../lib/deliveryDetailHelpers";

type PickupPrompt = {
  delivery: { forklift_id: string; booking_id: string | null; address: string | null; driver_name: string | null; driver_phone: string | null; hours_reading: number | null };
  bookingEndDate: string;
  forkliftName: string;
};

export default function DeliveryDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigateTransition();
  const { data: delivery, isLoading } = useDelivery(id);
  const { data: siblingDeliveries } = useDeliveries(delivery?.booking_id ?? undefined);
  const { data: bookings } = useBookings();
  const { forkliftMap } = useForkliftMap();
  const updateDelivery = useUpdateDelivery();
  const deleteDelivery = useDeleteDelivery();

  const [signatureOpen, setSignatureOpen] = useState(false);
  const [hoursReading, setHoursReading] = useState("");
  const [pickupPrompt, setPickupPrompt] = useState<PickupPrompt | null>(null);

  if (isLoading) {
    return (
      <PageContainer>
        <Skeleton className="h-10 w-64" />
        <div className="grid gap-6 md:grid-cols-2"><Skeleton className="h-48" /><Skeleton className="h-48" /></div>
      </PageContainer>
    );
  }

  if (!delivery) {
    return <div className="flex flex-col items-center justify-center h-[60vh]"><p className="text-muted-foreground">Entrega no encontrada</p></div>;
  }

  const forklift = forkliftMap.get(delivery.forklift_id);
  const linkedBooking = delivery.booking_id ? bookings?.find((b) => b.id === delivery.booking_id) : null;
  const hoursUsed = computeHoursUsed(delivery.booking_id, siblingDeliveries);
  const subtitle = buildDeliverySubtitle(forklift?.name, delivery.type);

  const promptPickupIfNeeded = () => {
    const bookingId = delivery.booking_id;
    if (delivery.type !== "delivery" || !bookingId || !linkedBooking || !forklift) return;
    setPickupPrompt({
      delivery: {
        forklift_id: delivery.forklift_id,
        booking_id: bookingId,
        address: delivery.address,
        driver_name: delivery.driver_name,
        driver_phone: delivery.driver_phone,
        hours_reading: delivery.hours_reading ?? null,
      },
      bookingEndDate: linkedBooking.end_date,
      forkliftName: forklift.name,
    });
  };

  const markComplete = (signature?: string) => {
    updateDelivery.mutate(
      buildCompletionPayload(delivery.id, nowMty().toISOString(), signature, hoursReading),
      {
        onSuccess: () => {
          notifySuccess("Marcado como completado");
          setSignatureOpen(false);
          promptPickupIfNeeded();
        },
      },
    );
  };

  const handleDelete = () => {
    deleteDelivery.mutate(delivery.id, {
      onSuccess: () => { notifySuccess("Entrega eliminada"); navigate("/deliveries"); },
    });
  };

  return (
    <>
      <PageContainer>
        <DetailPageHeader
          title={delivery.delivery_number}
          subtitle={subtitle}
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

        <DeliverySignatureCard signatureBase64={delivery.signature_base64} />
      </PageContainer>

      <DeliveryDetailDialogs
        signatureOpen={signatureOpen}
        setSignatureOpen={setSignatureOpen}
        hoursReading={hoursReading}
        setHoursReading={setHoursReading}
        onComplete={markComplete}
        pickupPrompt={pickupPrompt}
        onPickupClose={() => setPickupPrompt(null)}
      />
    </>
  );
}
