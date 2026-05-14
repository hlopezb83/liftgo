import { useParams } from "react-router-dom";

import { useReturnInspection } from "@/features/returns/hooks/useReturnInspections";
import { DetailPageHeader } from "@/components/DetailPageHeader";
import { StatusBadge } from "@/components/StatusBadge";
import { Skeleton } from "@/components/ui/skeleton";
import { EquipmentCard } from "@/features/returns/components/return-inspection/EquipmentCard";
import { BookingCard } from "@/features/returns/components/return-inspection/BookingCard";
import { InspectionCard } from "@/features/returns/components/return-inspection/InspectionCard";
import { UsageFuelCard } from "@/features/returns/components/return-inspection/UsageFuelCard";
import { DamagesCard } from "@/features/returns/components/return-inspection/DamagesCard";
import type { ReturnInspectionWithJoins } from "@/types/rental";

export default function ReturnInspectionDetail() {
  const { id } = useParams<{ id: string }>();
  const { data: rawInspection, isLoading } = useReturnInspection(id);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-64" />
        <div className="grid gap-6 md:grid-cols-2">
          <Skeleton className="h-48" />
          <Skeleton className="h-48" />
        </div>
      </div>
    );
  }

  if (!rawInspection) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh]">
        <p className="text-muted-foreground">Devolución no encontrada</p>
      </div>
    );
  }

  const ins = rawInspection as ReturnInspectionWithJoins;

  return (
    <div className="space-y-6">
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
    </div>
  );
}
