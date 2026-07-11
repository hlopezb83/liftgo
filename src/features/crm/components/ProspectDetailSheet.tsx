import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";

import { CompanyIcon, UserIcon, Mail, PhoneIcon, PaymentIcon } from "@/components/icons";
import type { Prospect } from "../hooks/useProspects";
import { ProspectHistoryCard } from "./ProspectHistoryCard";
import { ProspectQuoteLink, ProspectNotes, ProspectClosureInfo } from "./prospectDetail/ProspectInfoBlocks";
import { ProspectActions } from "./prospectDetail/ProspectActions";
import { DetailRow } from "@/components/domain/DetailRow";

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




export function ProspectDetailSheet({ prospect, open, onOpenChange, onEdit, quoteNumber }: Props) {
  if (!prospect) return null;
  const close = () => onOpenChange(false);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <CompanyIcon className="h-5 w-5" />
            {prospect.companyName}
          </SheetTitle>
        </SheetHeader>

        <div className="mt-4 space-y-4">
          <Badge variant={STAGE_COLORS[prospect.stage] || "outline"}>
            {STAGE_LABELS[prospect.stage] || prospect.stage}
          </Badge>

          <div className="space-y-1">
            <DetailRow icon={UserIcon} label="Contacto" value={prospect.contactPerson} />
            <DetailRow icon={Mail} label="Correo" value={prospect.email} />
            <DetailRow icon={PhoneIcon} label="Teléfono" value={prospect.phone} />
            <DetailRow icon={PaymentIcon} label="Valor Estimado" value={prospect.dealValueLabel} />
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
