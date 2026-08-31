import { Activity } from "react";
import { DetailRow } from "@/components/domain/DetailRow";
import { StatusBadge } from "@/components/feedback/StatusBadge";
import { WarnIcon, FleetIcon, UserIcon, DocumentIcon, CostIcon, CalendarIcon } from "@/components/icons";
import { Separator } from "@/components/ui/separator";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { APP_LOCALE } from "@/lib/format/dateFormats";
import { formatCurrency } from "@/lib/format/formatCurrency";
import { formatMtyDate } from "@/lib/utils";
import type { DamageRecordWithJoins } from "@/types/rental";
import { shouldShowActualCost } from "../../lib/showActualCost";
import { DamageActions } from "./DamageActions";
import { DamagePhotosSection } from "./DamagePhotosSection";

interface Props {
  record: DamageRecordWithJoins | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function DamageDetailSheet({ record, open, onOpenChange }: Props) {
  if (!record) return null;




  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <WarnIcon className="h-5 w-5" />
            Detalle de Daño
          </SheetTitle>
        </SheetHeader>

        <Activity mode={open ? "visible" : "hidden"}>
        <div className="mt-4 space-y-4">
          <StatusBadge status={record.status} />

          <div className="space-y-1">
            <DetailRow icon={FleetIcon} label="Montacargas" value={record.forklifts?.name || "—"} />
            <DetailRow icon={UserIcon} label="Cliente" value={record.customers?.name || "—"} />
            <DetailRow icon={CostIcon} label="Costo Estimado" value={formatCurrency(record.estimated_cost ?? 0)} />
            {shouldShowActualCost(record.actual_cost, record.status) && (
              <DetailRow icon={CostIcon} label="Costo Real" value={formatCurrency(record.actual_cost ?? 0)} />
            )}
            {/* R7-FE-02 (N7-MOV-05): TZ de negocio (Monterrey), no TZ del navegador,
                para coincidir con la lista (formatDateMty). */}
            <DetailRow icon={CalendarIcon} label="Fecha" value={formatMtyDate(record.created_at, "dd MMMM yyyy", APP_LOCALE)} />
          </div>

          <Separator />
          <div>
            <div className="flex items-center gap-2 mb-1">
              <DocumentIcon className="h-4 w-4 text-muted-foreground" />
              <p className="text-xs text-muted-foreground">Descripción</p>
            </div>
            <p className="text-sm whitespace-pre-wrap">{record.description}</p>
          </div>

          <Separator />
          <DamagePhotosSection entityType="damage_record" entityId={record.id} title="Fotos de Daño" />

          <Separator />
          {record.deleted_at ? (
            // R5-A6: un daño archivado solo admite restaurarse (solo admin).
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">Este registro está archivado.</p>
              <Button
                variant="outline"
                className="w-full"
                disabled={restore.isPending}
                onClick={() => restore.mutate(record.id, { onSuccess: () => onOpenChange(false) })}
              >
                Restaurar registro
              </Button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Acciones:</span>
              <DamageActions record={record} onClose={() => onOpenChange(false)} />
            </div>
          )}

          <div className="text-xs text-muted-foreground space-y-1">
            <p>Creado: {formatMtyDate(record.created_at, "dd MMM yyyy, HH:mm", APP_LOCALE)}</p>
            <p>Actualizado: {formatMtyDate(record.updated_at, "dd MMM yyyy, HH:mm", APP_LOCALE)}</p>
          </div>
        </div>
        </Activity>
      </SheetContent>
    </Sheet>
  );
}
