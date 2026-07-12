import { Activity } from "react";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { MAINTENANCE_WORK_STATUS_LABELS } from "@/lib/constants";
import { formatCurrency } from "@/lib/format/formatCurrency";
import { formatDateDisplay } from "@/lib/utils";
import { MaintenancePartsSection } from "../MaintenancePartsSection";
import type { MaintenanceLog } from "../../../hooks/maintenance/useMaintenanceLogs";

interface Props {
  log: (MaintenanceLog & { forklift_name: string }) | null;
  onClose: () => void;
}

export function MaintenanceDetailSheet({ log, onClose }: Props) {
  return (
    <Sheet open={!!log} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="sm:max-w-md overflow-y-auto">
        {log && (
          <>
            <SheetHeader>
              <SheetTitle>{log.service_type}</SheetTitle>
              <SheetDescription>{log.forklift_name}</SheetDescription>
            </SheetHeader>

            <Activity mode={log ? "visible" : "hidden"}>
            <div className="mt-6 space-y-6">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-muted-foreground">Fecha</p>
                  <p className="font-medium">{formatDateDisplay(log.performed_at)}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Realizado por</p>
                  <p className="font-medium">{log.performed_by || "—"}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Estado</p>
                  <Badge variant="secondary">
                    {MAINTENANCE_WORK_STATUS_LABELS[log.work_status as keyof typeof MAINTENANCE_WORK_STATUS_LABELS] || log.work_status}
                  </Badge>
                </div>
                <div>
                  <p className="text-muted-foreground">Costo Total</p>
                  <p className="font-semibold text-lg">{formatCurrency(log.cost || 0)}</p>
                </div>
              </div>

              {log.description && (
                <div className="text-sm">
                  <p className="text-muted-foreground mb-1">Descripción</p>
                  <p className="whitespace-pre-wrap">{log.description}</p>
                </div>
              )}

              <Separator />

              <MaintenancePartsSection
                maintenanceLogId={log.id}
                currentCost={log.cost || 0}
              />
            </div>
            </Activity>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
