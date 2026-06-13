import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Separator } from "@/components/ui/separator";
import { StatusBadge } from "@/components/feedback/StatusBadge";
import { DamageActions } from "@/features/damage/components/damage/DamageActions";
import { DamagePhotosSection } from "@/features/damage/components/damage/DamagePhotosSection";
import { formatCurrency } from "@/lib/format/formatCurrency";
import type { DamageRecordWithJoins } from "@/types/rental";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { AlertTriangle, Truck, User, FileText, DollarSign, Calendar } from "lucide-react";

interface Props {
  record: DamageRecordWithJoins | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function DamageDetailSheet({ record, open, onOpenChange }: Props) {
  if (!record) return null;

  const DetailRow = ({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: React.ReactNode }) => (
    <div className="flex items-start gap-3 py-2">
      <Icon className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-sm font-medium">{value || "—"}</p>
      </div>
    </div>
  );

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5" />
            Detalle de Daño
          </SheetTitle>
        </SheetHeader>

        <div className="mt-4 space-y-4">
          <StatusBadge status={record.status} />

          <div className="space-y-1">
            <DetailRow icon={Truck} label="Montacargas" value={record.forklifts?.name || "—"} />
            <DetailRow icon={User} label="Cliente" value={record.customers?.name || "—"} />
            <DetailRow icon={DollarSign} label="Costo Estimado" value={formatCurrency(record.estimated_cost ?? 0)} />
            {record.actual_cost != null && record.actual_cost > 0 && (
              <DetailRow icon={DollarSign} label="Costo Real" value={formatCurrency(record.actual_cost)} />
            )}
            <DetailRow icon={Calendar} label="Fecha" value={format(new Date(record.created_at), "dd MMMM yyyy", { locale: es })} />
          </div>

          <Separator />
          <div>
            <div className="flex items-center gap-2 mb-1">
              <FileText className="h-4 w-4 text-muted-foreground" />
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
