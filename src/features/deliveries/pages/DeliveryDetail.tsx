import { useState } from "react";
import { AdminCorrectionDialog } from "@/components/domain/AdminCorrectionDialog";
import { EmptyState } from "@/components/feedback/EmptyState";
import { QueryErrorState } from "@/components/feedback/QueryErrorState";
import { StatusBadge } from "@/components/feedback/StatusBadge";
import { DetailPageHeader } from "@/components/layout/DetailPageHeader";
import { PageContainer } from "@/components/layout/PageContainer";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useUserRole } from "@/features/users";
import { useNavigateTransition } from "@/hooks/useNavigateTransition";
import { todayKeyMty } from "@/lib/format/dateFormats";
import { useParams } from "@/lib/router-compat";
import { notifySuccess } from "@/lib/ui/appFeedback";
import { DeliveryActions } from "../components/deliveries/DeliveryActions";
import { DeliveryDetailBody } from "../components/deliveries/DeliveryDetailBody";
import { DeliveryDetailDialogs } from "../components/deliveries/DeliveryDetailDialogs";
import { RescheduleDeliveryDialog } from "../components/deliveries/RescheduleDeliveryDialog";
import { useCorrectDeliveryDate, useDeleteDelivery, useVoidDelivery } from "../hooks/useDeliveries";
import { useDeliveryCompletion } from "../hooks/useDeliveryCompletion";
import { useDeliveryDetailData } from "../hooks/useDeliveryDetailData";
import { buildDeliverySubtitle, canDeleteDeliveryFor, computeHoursUsed } from "../lib/deliveryDetailHelpers";

export default function DeliveryDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigateTransition();
  const { deliveryQuery, bookingQuery, hasLinkedBooking, linkedBooking, siblingDeliveries, forklift } = useDeliveryDetailData(id);
  const { data: delivery, isLoading, isError, refetch } = deliveryQuery;
  const deleteDelivery = useDeleteDelivery();
  const correctDate = useCorrectDeliveryDate();
  const voidDelivery = useVoidDelivery();
  const { data: role } = useUserRole();
  const [editOpen, setEditOpen] = useState(false);
  const [correctOpen, setCorrectOpen] = useState(false);
  const [voidOpen, setVoidOpen] = useState(false);

  const completion = useDeliveryCompletion(delivery, siblingDeliveries, linkedBooking, forklift);

  if (isLoading || (hasLinkedBooking && bookingQuery.isLoading)) {
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

  if (hasLinkedBooking && bookingQuery.isError) {
    return (
      <PageContainer>
        <QueryErrorState error={bookingQuery.error} entity="la reserva vinculada" onRetry={() => { void bookingQuery.refetch(); }} />
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
            <div className="flex flex-wrap gap-2">
              {role === "admin" && delivery.status === "completed" && (
                <>
                  <Button variant="outline" size="sm" onClick={() => setCorrectOpen(true)}>Corregir fecha</Button>
                  <Button variant="outline" size="sm" className="text-destructive" onClick={() => setVoidOpen(true)}>Anular</Button>
                </>
              )}
              <DeliveryActions
                status={delivery.status}
                canDelete={canDeleteDeliveryFor(delivery.status, role)}
                onEdit={() => setEditOpen(true)}
                onComplete={() => completion.setSignatureOpen(true)}
                onDelete={handleDelete}
              />
            </div>
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
        isCompleting={completion.isPending}
        setSignatureOpen={completion.setSignatureOpen}
        hoursReading={completion.hoursReading}
        setHoursReading={completion.setHoursReading}
        onComplete={completion.markComplete}
        pickupPrompt={completion.pickupPrompt}
        onPickupClose={() => completion.setPickupPrompt(null)}
        minHours={completion.minHours}
        operatorName={delivery.driver_name}
        transportType={delivery.type}
      />
      {editOpen && (
        <RescheduleDeliveryDialog
          delivery={delivery}
          linkedBooking={linkedBooking}
          open={editOpen}
          onOpenChange={setEditOpen}
        />
      )}
      {correctOpen && (
        <AdminCorrectionDialog
          open={correctOpen}
          onOpenChange={setCorrectOpen}
          title={`Corregir fecha de ${delivery.delivery_number}`}
          description="Cambia la fecha real en que se entregó el equipo. La reserva debe estar activa (si ya tiene devolución, anúlala primero)."
          confirmLabel="Guardar fecha"
          dateLabel="Fecha real de entrega"
          initialDate={delivery.scheduled_date}
          maxDate={todayKeyMty()}
          isPending={correctDate.isPending}
          onConfirm={({ reason, date }) => correctDate.mutate(
            { id: delivery.id, date: date ?? "", reason },
            { onSuccess: () => setCorrectOpen(false) },
          )}
        />
      )}
      {voidOpen && (
        <AdminCorrectionDialog
          open={voidOpen}
          onOpenChange={setVoidOpen}
          destructive
          title={`Anular ${delivery.delivery_number}`}
          description="Úsalo solo si esta entrega nunca ocurrió. Quedará cancelada en el historial y, si el montacargas no tiene otra renta entregada, regresará a disponible."
          confirmLabel="Anular entrega"
          isPending={voidDelivery.isPending}
          onConfirm={({ reason }) => voidDelivery.mutate(
            { id: delivery.id, reason },
            { onSuccess: () => setVoidOpen(false) },
          )}
        />
      )}
    </>
  );
}
