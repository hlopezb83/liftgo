import { useNavigate } from "react-router-dom";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { FileText, StickyNote } from "lucide-react";
import { formatCurrency } from "@/lib/formatCurrency";
import { LOST_REASON_LABELS } from "@/features/crm/lib/constants";
import type { Prospect } from "@/features/crm/hooks/useProspects";

interface Props {
  prospect: Prospect;
  quoteNumber?: string;
  onNavigate: () => void;
}

export function ProspectQuoteLink({ prospect, quoteNumber, onNavigate }: Props) {
  const navigate = useNavigate();
  if (!prospect.quote_id || !quoteNumber) return null;
  return (
    <>
      <Separator />
      <div className="flex items-start gap-3 py-2">
        <FileText className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
        <div>
          <p className="text-xs text-muted-foreground">Cotización Vinculada</p>
          <Badge
            variant="secondary"
            className="cursor-pointer hover:bg-accent gap-1 mt-1"
            onClick={() => { onNavigate(); navigate(`/quotes/${prospect.quote_id}`); }}
          >
            <FileText className="h-3 w-3" />
            {quoteNumber}
          </Badge>
        </div>
      </div>
    </>
  );
}

export function ProspectNotes({ notes }: { notes: string | null | undefined }) {
  if (!notes) return null;
  return (
    <>
      <Separator />
      <div>
        <div className="flex items-center gap-2 mb-1">
          <StickyNote className="h-4 w-4 text-muted-foreground" />
          <p className="text-xs text-muted-foreground">Notas</p>
        </div>
        <p className="text-sm whitespace-pre-wrap">{notes}</p>
      </div>
    </>
  );
}

export function ProspectClosureInfo({ prospect }: { prospect: Prospect }) {
  const isClosed = prospect.stage === "cerrado_ganado" || prospect.stage === "cerrado_perdido";
  if (!isClosed) return null;
  return (
    <>
      <Separator />
      <div className="rounded-md border bg-muted/30 p-3 space-y-1 text-xs">
        <p className="font-semibold text-sm">Información de cierre</p>
        {prospect.closed_at && (
          <p>Fecha cierre: <span className="font-medium">{format(new Date(prospect.closed_at), "dd MMM yyyy", { locale: es })}</span></p>
        )}
        {prospect.stage === "cerrado_ganado" && prospect.final_amount != null && (
          <p>Monto final: <span className="font-medium">{formatCurrency(prospect.final_amount)}</span></p>
        )}
        {prospect.stage === "cerrado_perdido" && prospect.lost_reason && (
          <p>Razón: <span className="font-medium">{LOST_REASON_LABELS[prospect.lost_reason] ?? prospect.lost_reason}</span></p>
        )}
      </div>
    </>
  );
}
