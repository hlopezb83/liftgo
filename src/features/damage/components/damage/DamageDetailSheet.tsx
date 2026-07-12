import { format } from "date-fns";
import { Activity } from "react";
import { DetailRow } from "@/components/domain/DetailRow";
import { StatusBadge } from "@/components/feedback/StatusBadge";
import { WarnIcon, FleetIcon, UserIcon, DocumentIcon, CostIcon, CalendarIcon } from "@/components/icons";
import { Separator } from "@/components/ui/separator";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { APP_LOCALE } from "@/lib/format/dateFormats";
import { formatCurrency } from "@/lib/format/formatCurrency";
import type { DamageRecordWithJoins } from "@/types/rental";
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
            {record.actual_cost != null && record.actual_cost > 0 && (
              <DetailRow icon={CostIcon} label="Costo Real" value={formatCurrency(record.actual_cost)} />
            )}
            <DetailRow icon={CalendarIcon} label="Fecha" value={format(new Date(record.created_at), "dd MMMM yyyy", { locale: APP_LOCALE })} />
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
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Acciones:</span>
            <DamageActions record={record} />
          </div>

          <div className="text-xs text-muted-foreground space-y-1">
            <p>Creado: {format(new Date(record.created_at), "dd MMM yyyy, HH:mm", { locale: APP_LOCALE })}</p>
            <p>Actualizado: {format(new Date(record.updated_at), "dd MMM yyyy, HH:mm", { locale: APP_LOCALE })}</p>
          </div>
        </div>
        </Activity>
      </SheetContent>
    </Sheet>
  );
}
