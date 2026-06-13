import { Card, CardContent } from "@/components/ui/card";
import { formatCurrency } from "@/lib/format/formatCurrency";
import { formatDateDisplay } from "@/lib/utils";
import type { MaintenanceLog } from "@/features/maintenance/hooks/maintenance/useMaintenanceLogs";
import type { Tables } from "@/integrations/supabase/types";

type ForkliftMap = Map<string, Tables<"forklifts">>;



export function MaintenanceMobileCard({
  log, forkliftMap, onClick,
}: { log: MaintenanceLog; forkliftMap: ForkliftMap; onClick: () => void }) {
  return (
    <Card className="cursor-pointer" onClick={onClick}>
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-1">
          <span className="text-sm font-semibold">{log.service_type}</span>
          <span className="text-sm font-mono font-medium">{formatCurrency(log.cost || 0)}</span>
        </div>
        <p className="text-sm font-medium">{forkliftMap.get(log.forklift_id)?.name || "—"}</p>
        <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
          <span className="font-mono">{formatDateDisplay(log.performed_at)}</span>
          {log.performed_by && <span>por {log.performed_by}</span>}
        </div>
        {log.next_service_date && (
          <p className="text-xs text-muted-foreground mt-1">Próx: {formatDateDisplay(log.next_service_date)}</p>
        )}
      </CardContent>
    </Card>
  );
}
