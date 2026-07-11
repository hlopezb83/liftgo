import { useParams } from "react-router-dom";
import { notifyError, notifySuccess } from "@/lib/ui/appFeedback";
import { useForklift, useDeleteForklift, useStatusLogs } from "../hooks/forklifts/useForklifts";
import { useBookings } from "@/features/bookings";
import { useMaintenanceLogs } from "@/features/maintenance";
import { useForkliftFinancials } from "../hooks/forklifts/useForkliftFinancials";
import { useForkliftLocation } from "../hooks/forklifts/useForkliftLocation";
import { DetailPageHeader } from "@/components/layout/DetailPageHeader";
import { PageContainer } from "@/components/layout/PageContainer";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/feedback/StatusBadge";
import { Skeleton } from "@/components/ui/skeleton";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useState } from "react";
import { Edit, DeleteIcon } from "@/components/icons";

import { DocumentAttachments } from "../components/forklift-detail/DocumentAttachments";
import { NotesCard } from "@/components/domain/NotesCard";
import { DamagePhotosSection } from "@/features/damage";
import { ForkliftSpecsCard } from "../components/forklift-detail/ForkliftSpecsCard";
import { ForkliftRatesCard } from "../components/forklift-detail/ForkliftRatesCard";
import { ForkliftBookingsList } from "../components/forklift-detail/ForkliftBookingsList";
import { ForkliftMaintenanceList } from "../components/forklift-detail/ForkliftMaintenanceList";
import { ForkliftStatusHistory } from "../components/forklift-detail/ForkliftStatusHistory";
import { StatusChangeCard } from "../components/forklift-detail/StatusChangeCard";
import { ForkliftFinancialCard } from "../components/forklift-detail/ForkliftFinancialCard";
import { ForkliftHourometerHistory } from "../components/forklift-detail/ForkliftHourometerHistory";

import { useNavigateTransition } from "@/hooks/useNavigateTransition";
export default function ForkliftDetail() {
  const { id } = useParams();
  const navigate = useNavigateTransition();
  const { data: forklift, isLoading } = useForklift(id);
  const { data: logs } = useStatusLogs(id);
  const { data: bookings } = useBookings(id);
  const { data: maintenanceLogs } = useMaintenanceLogs(id);
  const { data: financials, isLoading: loadingFinancials } = useForkliftFinancials(id);
  const { data: locationData } = useForkliftLocation(id);
  const deleteForklift = useDeleteForklift();
  const [deleteOpen, setDeleteOpen] = useState(false);

  if (isLoading) return <PageContainer><Skeleton className="h-96" /></PageContainer>;
  if (!forklift) return <PageContainer><p className="text-muted-foreground">Montacargas no encontrado</p></PageContainer>;

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
        badges={<StatusBadge status={forklift.status} />}
        actions={
          <>
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
          </>
        }
      />


      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <ForkliftSpecsCard forklift={forklift} currentLocation={locationData} />
        <ForkliftRatesCard forklift={forklift} />
      </div>

      {forklift.notes && (
        <NotesCard value={forklift.notes} readOnly />
      )}

      <ForkliftFinancialCard financials={financials} isLoading={loadingFinancials} />
      <StatusChangeCard forkliftId={forklift.id} currentStatus={forklift.status} />
      <ForkliftBookingsList bookings={bookings || []} />
      <ForkliftMaintenanceList logs={maintenanceLogs || []} />
      {financials && <ForkliftHourometerHistory history={financials.hourometer_history} />}
      {id && <DamagePhotosSection entityType="damage_forklift" entityId={id} title="Fotos de Daño" />}
      {id && <DocumentAttachments entityType="forklift" entityId={id} />}
      <ForkliftStatusHistory logs={logs || []} />
    </PageContainer>
  );
}
