import { QueryErrorState } from "@/components/feedback/QueryErrorState";
import { StatusBadge } from "@/components/feedback/StatusBadge";
import { DragDropImageUploader } from "@/components/forms/DragDropImageUploader";
import { DetailPageHeader } from "@/components/layout/DetailPageHeader";
import { PageContainer } from "@/components/layout/PageContainer";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useHasModuleAccess } from "@/features/users";
import { useDocuments } from "@/hooks/useDocuments";
import { useParams } from "@/lib/router-compat";
import { BookingCard } from "../components/return-inspection/BookingCard";
import { DamagesCard } from "../components/return-inspection/DamagesCard";
import { EquipmentCard } from "../components/return-inspection/EquipmentCard";
import { InspectionCard } from "../components/return-inspection/InspectionCard";
import { UsageFuelCard } from "../components/return-inspection/UsageFuelCard";
import { useReturnInspection } from "../hooks/useReturnInspections";

export default function ReturnInspectionDetail() {
  const { id } = useParams<{ id: string }>();
  const { data: ins, isLoading, isError, refetch } = useReturnInspection(id);
  const canUpload = useHasModuleAccess("Entregas", "full");
  const { data: photos = [], isLoading: photosLoading, isError: photosError, refetch: refetchPhotos } = useDocuments("return_inspection", id);

  if (isLoading) {
    return (
      <PageContainer maxWidth="wide">
        <Skeleton className="h-10 w-64" />
        <div className="grid gap-4 sm:gap-6 sm:grid-cols-2">
          <Skeleton className="h-48" />
          <Skeleton className="h-48" />
        </div>
      </PageContainer>
    );
  }

  if (isError) {
    return (
      <PageContainer maxWidth="wide">
        <QueryErrorState entity="la devolución" onRetry={() => { void refetch(); }} />
      </PageContainer>
    );
  }

  if (!ins) {
    return (
      <PageContainer maxWidth="wide">
        <div className="flex flex-col items-center justify-center h-[60vh]">
          <p className="text-muted-foreground">Devolución no encontrada</p>
        </div>
      </PageContainer>
    );
  }

  return (
    <PageContainer maxWidth="wide">
      <DetailPageHeader
        title={ins.inspection_number}
        subtitle={`${ins.forklifts?.name || "Equipo"} · ${ins.bookings?.customer_name || "Sin cliente"}`}
        badges={<StatusBadge status={ins.condition} />}
        backTo="/returns"
      />

      <div className="grid gap-4 sm:gap-6 sm:grid-cols-2">
        <EquipmentCard ins={ins} />
        <BookingCard ins={ins} />
        <InspectionCard ins={ins} />
        <UsageFuelCard ins={ins} />
        <DamagesCard ins={ins} />
      </div>
      <Card className="mt-4 sm:mt-6">
        <CardHeader><CardTitle className="text-base">Fotos de la inspección</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          {photosError ? <QueryErrorState entity="las fotos de la inspección" onRetry={() => { void refetchPhotos(); }} /> : photosLoading ? (
            <p className="text-sm text-muted-foreground">Cargando fotos…</p>
          ) : photos.length ? (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {photos.map((photo) => <a key={photo.id} href={photo.file_url} target="_blank" rel="noopener noreferrer" className="overflow-hidden rounded-md border">
                <img src={photo.file_url} alt={photo.file_name} className="aspect-square w-full object-cover" />
                <span className="block truncate p-2 text-xs">{photo.file_name}</span>
              </a>)}
            </div>
          ) : <p className="text-sm text-muted-foreground">Aún no hay fotos de esta inspección.</p>}
          {canUpload && <DragDropImageUploader entityType="return_inspection" entityId={ins.id} maxFiles={8} />}
        </CardContent>
      </Card>
    </PageContainer>
  );
}
