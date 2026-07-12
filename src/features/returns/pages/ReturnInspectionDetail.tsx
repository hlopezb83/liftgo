import { useParams } from "react-router-dom";
import { StatusBadge } from "@/components/feedback/StatusBadge";
import { DetailPageHeader } from "@/components/layout/DetailPageHeader";
import { PageContainer } from "@/components/layout/PageContainer";
import { Skeleton } from "@/components/ui/skeleton";
import { BookingCard } from "../components/return-inspection/BookingCard";
import { DamagesCard } from "../components/return-inspection/DamagesCard";
import { EquipmentCard } from "../components/return-inspection/EquipmentCard";
import { InspectionCard } from "../components/return-inspection/InspectionCard";
import { UsageFuelCard } from "../components/return-inspection/UsageFuelCard";
import { useReturnInspection } from "../hooks/useReturnInspections";

export default function ReturnInspectionDetail() {
  const { id } = useParams<{ id: string }>();
  const { data: ins, isLoading } = useReturnInspection(id);

  if (isLoading) {
    return (
      <PageContainer maxWidth="wide">
        <Skeleton className="h-10 w-64" />
        <div className="grid gap-6 md:grid-cols-2">
          <Skeleton className="h-48" />
          <Skeleton className="h-48" />
        </div>
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

      <div className="grid gap-6 md:grid-cols-2">
        <EquipmentCard ins={ins} />
        <BookingCard ins={ins} />
        <InspectionCard ins={ins} />
        <UsageFuelCard ins={ins} />
        <DamagesCard ins={ins} />
      </div>
    </PageContainer>
  );
}
