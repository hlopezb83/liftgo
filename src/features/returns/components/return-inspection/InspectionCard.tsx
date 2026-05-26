import { format } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ClipboardCheck } from "lucide-react";
import { StatusBadge } from "@/components/StatusBadge";
import { InfoRow } from "@/components/InfoRow";
import { parseDateLocal } from "@/lib/utils";
import type { ReturnInspectionWithJoins } from "@/types/rental";

export function InspectionCard({ ins }: { ins: ReturnInspectionWithJoins }) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <ClipboardCheck className="h-4 w-4 text-muted-foreground" />Inspección
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <InfoRow label="Fecha" value={format(parseDateLocal(ins.inspected_at), "dd/MM/yyyy HH:mm")} />
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">Condición</span>
          <StatusBadge status={ins.condition} />
        </div>
        <InfoRow label="Inspector" value={ins.inspected_by || "—"} />
      </CardContent>
    </Card>
  );
}
