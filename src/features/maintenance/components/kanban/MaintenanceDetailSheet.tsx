import { Activity } from "react";
import { Badge } from "@/components/ui/badge";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Separator } from "@/components/ui/separator";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { MAINTENANCE_WORK_STATUS_LABELS, serviceTypeLabel } from "@/lib/constants";
import { formatDateMty } from "@/lib/format/dateFormats";
import { formatCurrency } from "@/lib/format/formatCurrency";
import { useLaborDraftGuard } from "../../hooks/useLaborDraftGuard";
import { canModifyMaintenance } from "../../lib/maintenanceAccess";
import { MaintenanceLaborSection } from "../MaintenanceLaborSection";
import { MaintenancePartsSection } from "../MaintenancePartsSection";
import type { MaintenanceLog } from "../../hooks/useMaintenanceLogs";

interface Props {
  log: (MaintenanceLog & { forklift_name: string }) | null;
  onClose: () => void;
  onCloseAutoFocus?: (event: Event) => void;
  canWrite: boolean;
}

export function MaintenanceDetailSheet({ log, onClose, onCloseAutoFocus, canWrite }: Props) {
  const readOnly = !canModifyMaintenance(log, canWrite);
  const laborDraft = useLaborDraftGuard(log?.id, !!log);
  return (
    <>
    <Sheet open={!!log} onOpenChange={(open) => !open && laborDraft.requestLeave(onClose)}>
      <SheetContent className="sm:max-w-md overflow-y-auto" onCloseAutoFocus={onCloseAutoFocus}>
        {log && (
          <>
            <SheetHeader>
              <SheetTitle>{serviceTypeLabel(log.service_type)}</SheetTitle>
              <SheetDescription>{log.forklift_name}</SheetDescription>
            </SheetHeader>

            <Activity mode={log ? "visible" : "hidden"}>
            <div className="mt-6 space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-muted-foreground">Fecha</p>
                  <p className="font-medium">{formatDateMty(log.performed_at)}</p>
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
                readOnly={readOnly}
              />

              <Separator />

              <MaintenanceLaborSection key={`${log.id}:${laborDraft.resetKey}`} maintenanceLogId={log.id} readOnly={readOnly} onDraftChange={laborDraft.onDraftChange} />
            </div>
            </Activity>
          </>
        )}
      </SheetContent>
    </Sheet>
    <ConfirmDialog {...laborDraft.discardDialog} />
    </>
  );
}
