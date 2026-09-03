import { useParams } from "react-router";
import { EmptyState } from "@/components/feedback/EmptyState";
import { QueryErrorState } from "@/components/feedback/QueryErrorState";
import { StatusBadge } from "@/components/feedback/StatusBadge";
import { DetailPageHeader } from "@/components/layout/DetailPageHeader";
import { PageContainer } from "@/components/layout/PageContainer";
import { Skeleton } from "@/components/ui/skeleton";
import { useBookings } from "@/features/bookings";
import { useForkliftMap } from "@/features/fleet";
import { useUserRole } from "@/features/users";
import { useNavigateTransition } from "@/hooks/useNavigateTransition";
import { notifySuccess } from "@/lib/ui/appFeedback";
import { DeliveryActions } from "../components/deliveries/DeliveryActions";
import { DeliveryDetailBody } from "../components/deliveries/DeliveryDetailBody";
import { DeliveryDetailDialogs } from "../components/deliveries/DeliveryDetailDialogs";
import { useDeliveries, useDelivery, useDeleteDelivery } from "../hooks/useDeliveries";
import { useDeliveryCompletion } from "../hooks/useDeliveryCompletion";
import { buildDeliverySubtitle, canDeleteDeliveryFor, computeHoursUsed } from "../lib/deliveryDetailHelpers";

export default function DeliveryDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigateTransition();
  const { data: delivery, isLoading, isError, refetch } = useDelivery(id);
  const { data: siblingDeliveries } = useDeliveries(delivery?.booking_id ?? undefined);
  const { data: bookings } = useBookings();
  const { forkliftMap } = useForkliftMap();
  const deleteDelivery = useDeleteDelivery();
  const { data: role } = useUserRole();

  const forklift = delivery ? forkliftMap.get(delivery.forklift_id) : undefined;
  const linkedBooking = delivery?.booking_id
    ? bookings?.find((b) => b.id === delivery.booking_id) ?? null
    : null;

  const completion = useDeliveryCompletion(delivery, siblingDeliveries, linkedBooking, forklift);

  if (isLoading) {
    return (
      <PageContainer>
        <Skeleton className="h-10 w-64" />
        <div className="grid gap-4 sm:gap-6 sm:grid-cols-2"><Skeleton className="h-48" /><Skeleton className="h-48" /></div>
      </PageContainer>
    );
  }

  if (isError) {
    return (
      <PageContainer>
        <QueryErrorState entity="la entrega" onRetry={() => { void refetch(); }} />
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
          subtitle={buildDeliverySubtitle(forklift?.name, delivery.type)}
          badges={<StatusBadge status={delivery.status} />}
          backTo="/deliveries"
          actions={
            <DeliveryActions
              status={delivery.status}
              canDelete={canDeleteDeliveryFor(delivery.status, role)}
              onComplete={() => completion.setSignatureOpen(true)}
              onDelete={handleDelete}
            />
          }
        />

        <DeliveryDetailBody
          delivery={delivery}
          forkliftName={forklift?.name}
          forkliftModel={forklift?.model}
          hoursUsed={computeHoursUsed(delivery.booking_id, siblingDeliveries)}
          linkedBooking={linkedBooking}
        />
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
        operatorName={delivery.driver_name}
      />
    </>
  );
}

