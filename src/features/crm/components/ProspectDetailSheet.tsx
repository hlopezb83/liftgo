import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { formatCurrency } from "@/lib/formatCurrency";
import { Building2, User, Mail, Phone, DollarSign } from "lucide-react";
import type { Prospect } from "@/features/crm/hooks/useProspects";
import { ProspectHistoryCard } from "./ProspectHistoryCard";
import { ProspectQuoteLink, ProspectNotes, ProspectClosureInfo } from "./prospectDetail/ProspectInfoBlocks";
import { ProspectActions } from "./prospectDetail/ProspectActions";

const STAGE_LABELS: Record<string, string> = {
  nuevo_prospecto: "Nuevo Prospecto",
  contactado: "Contactado",
  cotizacion_enviada: "Cotización Enviada",
  negociacion: "Negociación",
  cerrado_ganado: "Cerrado Ganado",
  cerrado_perdido: "Cerrado Perdido",
};

const STAGE_COLORS: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  nuevo_prospecto: "default",
  contactado: "secondary",
  cotizacion_enviada: "outline",
  negociacion: "secondary",
  cerrado_ganado: "default",
  cerrado_perdido: "destructive",
};

interface Props {
  prospect: Prospect | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onEdit: (prospect: Prospect) => void;
  quoteNumber?: string;
}

function DetailRow({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3 py-2">
      <Icon className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-sm font-medium">{value || "—"}</p>
      </div>
    </div>
  );
}

export function ProspectDetailSheet({ prospect, open, onOpenChange, onEdit, quoteNumber }: Props) {
  if (!prospect) return null;
  const close = () => onOpenChange(false);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5" />
            {prospect.companyName}
          </SheetTitle>
        </SheetHeader>

        <div className="mt-4 space-y-4">
          <Badge variant={STAGE_COLORS[prospect.stage] || "outline"}>
            {STAGE_LABELS[prospect.stage] || prospect.stage}
          </Badge>

          <div className="space-y-1">
            <DetailRow icon={User} label="Contacto" value={prospect.contactPerson} />
            <DetailRow icon={Mail} label="Correo" value={prospect.email} />
            <DetailRow icon={Phone} label="Teléfono" value={prospect.phone} />
            <DetailRow icon={DollarSign} label="Valor Estimado" value={prospect.dealValueLabel} />
          </div>

          <ProspectQuoteLink prospect={prospect} quoteNumber={quoteNumber} onNavigate={close} />
          <ProspectNotes notes={prospect.notes} />

          <Separator />
          <ProspectHistoryCard prospectId={prospect.id} />

          <ProspectClosureInfo prospect={prospect} />

          <Separator />
          <ProspectActions prospect={prospect} onEdit={() => onEdit(prospect)} onClose={close} />
        </div>
      </SheetContent>
    </Sheet>
  );
}
