import { useState } from "react";
import { useParams } from "react-router";
import { NotesCard } from "@/components/domain/NotesCard";
import { EmptyState } from "@/components/feedback/EmptyState";
import { QueryErrorState } from "@/components/feedback/QueryErrorState";
import { StatusBadge } from "@/components/feedback/StatusBadge";
import { Edit, DeleteIcon } from "@/components/icons";
import { DetailPageHeader } from "@/components/layout/DetailPageHeader";
import { PageContainer } from "@/components/layout/PageContainer";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { useServerTodayMty } from "@/features/availability";
import { computeFleetAvailability, deriveForkliftDisplayStatus } from "@/features/availability/utils/fleetAvailability";
import { useBookings } from "@/features/bookings";
import { DamagePhotosSection } from "@/features/damage";
import { useMaintenanceLogs } from "@/features/maintenance";
import { useNavigateTransition } from "@/hooks/useNavigateTransition";
import { RoleGuard } from "@/layouts/RoleGuard";
import { notifyError, notifySuccess } from "@/lib/ui/appFeedback";
import { DocumentAttachments } from "../components/forklift-detail/DocumentAttachments";
import { ForkliftBookingsList } from "../components/forklift-detail/ForkliftBookingsList";
import { ForkliftFinancialCard } from "../components/forklift-detail/ForkliftFinancialCard";
import { ForkliftHourometerHistory } from "../components/forklift-detail/ForkliftHourometerHistory";
import { ForkliftMaintenanceList } from "../components/forklift-detail/ForkliftMaintenanceList";
import { ForkliftRatesCard } from "../components/forklift-detail/ForkliftRatesCard";
import { ForkliftSpecsCard } from "../components/forklift-detail/ForkliftSpecsCard";
import { ForkliftStatusHistory } from "../components/forklift-detail/ForkliftStatusHistory";
import { StatusChangeCard } from "../components/forklift-detail/StatusChangeCard";
import { useForkliftFinancials } from "../hooks/forklifts/useForkliftFinancials";
import { useForkliftLocation } from "../hooks/forklifts/useForkliftLocation";
import { useForklift, useDeleteForklift, useStatusLogs } from "../hooks/forklifts/useForklifts";

export default function ForkliftDetail() {
  const { id } = useParams();
  const navigate = useNavigateTransition();
  const { data: forklift, isLoading, isError, refetch } = useForklift(id);
  const { data: logs } = useStatusLogs(id);
  const { data: bookings } = useBookings(id);
  const { data: maintenanceLogs } = useMaintenanceLogs(id);
  // R9-FE: mismo criterio operativo que FleetPage — el `status` crudo se
  // desincroniza (available con reserva vigente, o rented sin ella). El badge
  // del detalle debe reflejar la disponibilidad derivada, no el status crudo.
  const todayYmd = useServerTodayMty();
  const availability = forklift && bookings ? computeFleetAvailability([forklift], bookings, todayYmd) : null;
  const displayStatus = deriveForkliftDisplayStatus(forklift, availability);
  const { data: financials, isLoading: loadingFinancials } = useForkliftFinancials(id);
  const { data: locationData, isError: locationError } = useForkliftLocation(id);
  const deleteForklift = useDeleteForklift();
  const [deleteOpen, setDeleteOpen] = useState(false);

  if (isLoading) return <PageContainer><Skeleton className="h-96" /></PageContainer>;
  if (isError) {
    return (
      <PageContainer>
        <QueryErrorState entity="el montacargas" onRetry={() => { void refetch(); }} />
      </PageContainer>
    );
  }
  if (!forklift) {
    return (
      <PageContainer>
        <EmptyState
          title="Montacargas no encontrado"
          actionLabel="Volver"
          onAction={() => navigate("/fleet")}
        />
      </PageContainer>
    );
  }

  const handleDelete = () => {
    deleteForklift.mutate(forklift.id, {
      onSuccess: () => { notifySuccess("Montacargas archivado"); navigate("/fleet"); },
      onError: (err) => notifyError({ error: err, message: err.message || "Error al archivar" }),
    });
  };

  return (
    <PageContainer maxWidth="wide">
      <DetailPageHeader
        title={forklift.name}
        subtitle={`${forklift.model} — ${forklift.manufacturer}`}
        backTo="/fleet"
        badges={<StatusBadge status={displayStatus ?? forklift.status} />}
        actions={
          <>
            <RoleGuard module="Flota" minAccess="full" fallback={null}>
              <Button variant="outline" size="sm" onClick={() => navigate(`/fleet/${id}/edit`)}>
                <Edit className="h-4 w-4 mr-1" /> Editar
              </Button>
              <Button variant="destructive" size="sm" onClick={() => setDeleteOpen(true)}>
                <DeleteIcon className="h-4 w-4 mr-1" /> Archivar
              </Button>
              <ConfirmDialog
                open={deleteOpen}
                onOpenChange={setDeleteOpen}
                title={`¿Archivar ${forklift.name}?`}
                description="El montacargas se ocultará de los listados activos pero se conservará el historial completo (bookings, mantenimientos, daños) para reportes y auditoría. No se puede archivar si tiene reservas activas."
                confirmLabel="Archivar"
                destructive
                onConfirm={handleDelete}
              />
            </RoleGuard>
          </>
        }
      />


      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
        <ForkliftSpecsCard forklift={forklift} currentLocation={locationData} locationError={locationError} />
        <ForkliftRatesCard forklift={forklift} />
      </div>

      {forklift.notes && (
        <NotesCard value={forklift.notes} readOnly />
      )}

      <ForkliftFinancialCard financials={financials} isLoading={loadingFinancials} />
      <RoleGuard module="Flota" minAccess="full" fallback={null}>
        <StatusChangeCard forkliftId={forklift.id} currentStatus={forklift.status} />
      </RoleGuard>
      <ForkliftBookingsList bookings={bookings || []} />
      <ForkliftMaintenanceList logs={maintenanceLogs || []} />
      {financials && <ForkliftHourometerHistory history={financials.hourometer_history} />}
      {id && <DamagePhotosSection entityType="damage_forklift" entityId={id} title="Fotos de Daño" />}
      {id && <DocumentAttachments entityType="forklift" entityId={id} />}
      <ForkliftStatusHistory logs={logs || []} />
    </PageContainer>
  );
}
