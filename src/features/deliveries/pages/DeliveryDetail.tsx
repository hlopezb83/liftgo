import { useParams } from "react-router";
import { NotesCard } from "@/components/domain/NotesCard";
import { EmptyState } from "@/components/feedback/EmptyState";
import { StatusBadge } from "@/components/feedback/StatusBadge";
import { DetailPageHeader } from "@/components/layout/DetailPageHeader";
import { PageContainer } from "@/components/layout/PageContainer";
import { Skeleton } from "@/components/ui/skeleton";
import { useBookings } from "@/features/bookings";
import { useForkliftMap } from "@/features/fleet";
import { useNavigateTransition } from "@/hooks/useNavigateTransition";
import { notifySuccess } from "@/lib/ui/appFeedback";
import { DeliveryActions } from "../components/deliveries/DeliveryActions";
import { DeliveryDetailDialogs } from "../components/deliveries/DeliveryDetailDialogs";
import {
  DeliveryStatusCard, DeliveryEquipmentCard, DeliveryLogisticsCard, DeliveryBookingCard,
} from "../components/deliveries/DeliveryInfoCards";
import { DeliverySignatureCard } from "../components/deliveries/DeliverySignatureCard";
import { useDeliveries, useDelivery, useDeleteDelivery } from "../hooks/useDeliveries";
import { useDeliveryCompletion } from "../hooks/useDeliveryCompletion";
import { buildDeliverySubtitle, computeHoursUsed } from "../lib/deliveryDetailHelpers";

export default function DeliveryDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigateTransition();
  const { data: delivery, isLoading } = useDelivery(id);
  const { data: siblingDeliveries } = useDeliveries(delivery?.booking_id ?? undefined);
  const { data: bookings } = useBookings();
  const { forkliftMap } = useForkliftMap();
  const deleteDelivery = useDeleteDelivery();

  const forklift = delivery ? forkliftMap.get(delivery.forklift_id) : undefined;
  const linkedBooking = delivery?.booking_id
    ? bookings?.find((b) => b.id === delivery.booking_id) ?? null
    : null;

  const completion = useDeliveryCompletion(delivery, siblingDeliveries, linkedBooking, forklift);

  if (isLoading) {
    return (
      <PageContainer>
        <Skeleton className="h-10 w-64" />
        <div className="grid gap-6 md:grid-cols-2"><Skeleton className="h-48" /><Skeleton className="h-48" /></div>
      </PageContainer>
    );
  }

  if (!delivery) {
    return (
      <PageContainer>
        <EmptyState
          title="Entrega no encontrada"
          actionLabel="Volver"
          onAction={() => navigate("/deliveries")}
        />
      </PageContainer>
    );
  }

  const hoursUsed = computeHoursUsed(delivery.booking_id, siblingDeliveries);
  const subtitle = buildDeliverySubtitle(forklift?.name, delivery.type);

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
              onComplete={() => completion.setSignatureOpen(true)}
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
        signatureOpen={completion.signatureOpen}
        setSignatureOpen={completion.setSignatureOpen}
        hoursReading={completion.hoursReading}
        setHoursReading={completion.setHoursReading}
        onComplete={completion.markComplete}
        pickupPrompt={completion.pickupPrompt}
        onPickupClose={() => completion.setPickupPrompt(null)}
        minHours={completion.minHours}
      />
    </>
  );
}
