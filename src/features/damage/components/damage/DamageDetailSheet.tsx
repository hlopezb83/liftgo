import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Separator } from "@/components/ui/separator";
import { StatusBadge } from "@/components/feedback/StatusBadge";
import { DamageActions } from "./DamageActions";
import { DamagePhotosSection } from "./DamagePhotosSection";
import { formatCurrency } from "@/lib/format/formatCurrency";
import type { DamageRecordWithJoins } from "@/types/rental";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { WarnIcon, FleetIcon, UserIcon, DocumentIcon, MoneyIcon, CalendarIcon } from "@/components/icons";
import { DetailRow } from "@/components/domain/DetailRow";

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

        <div className="mt-4 space-y-4">
          <StatusBadge status={record.status} />

          <div className="space-y-1">
            <DetailRow icon={FleetIcon} label="Montacargas" value={record.forklifts?.name || "—"} />
            <DetailRow icon={UserIcon} label="Cliente" value={record.customers?.name || "—"} />
            <DetailRow icon={MoneyIcon} label="Costo Estimado" value={formatCurrency(record.estimated_cost ?? 0)} />
            {record.actual_cost != null && record.actual_cost > 0 && (
              <DetailRow icon={MoneyIcon} label="Costo Real" value={formatCurrency(record.actual_cost)} />
            )}
            <DetailRow icon={CalendarIcon} label="Fecha" value={format(new Date(record.created_at), "dd MMMM yyyy", { locale: es })} />
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
            <p>Creado: {format(new Date(record.created_at), "dd MMM yyyy, HH:mm", { locale: es })}</p>
            <p>Actualizado: {format(new Date(record.updated_at), "dd MMM yyyy, HH:mm", { locale: es })}</p>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
