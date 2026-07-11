
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { DocumentIcon, StickyNote } from "@/components/icons";
import { formatCurrency } from "@/lib/format/formatCurrency";
import { LOST_REASON_LABELS } from "../../lib/constants";
import type { Prospect } from "../../hooks/useProspects";

import { useNavigateTransition } from "@/hooks/useNavigateTransition";
interface Props {
  prospect: Prospect;
  quoteNumber?: string;
  onNavigate: () => void;
}

export function ProspectQuoteLink({ prospect, quoteNumber, onNavigate }: Props) {
  const navigate = useNavigateTransition();
  if (!prospect.quoteId || !quoteNumber) return null;
  return (
    <>
      <Separator />
      <div className="flex items-start gap-3 py-2">
        <DocumentIcon className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
        <div>
          <p className="text-xs text-muted-foreground">Cotización Vinculada</p>
          <Badge
            variant="secondary"
            className="cursor-pointer hover:bg-accent gap-1 mt-1"
            onClick={() => { onNavigate(); navigate(`/quotes/${prospect.quoteId}`); }}
          >
            <DocumentIcon className="h-3 w-3" />
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
  if (!prospect.isClosed) return null;
  return (
    <>
      <Separator />
      <div className="rounded-md border bg-muted/30 p-3 space-y-1 text-xs">
        <p className="font-semibold text-sm">Información de cierre</p>
        {prospect.closedAtLabel && (
          <p>Fecha cierre: <span className="font-medium">{prospect.closedAtLabel}</span></p>
        )}
        {prospect.stage === "cerrado_ganado" && prospect.finalAmount != null && (
          <p>Monto final: <span className="font-medium">{formatCurrency(prospect.finalAmount)}</span></p>
        )}
        {prospect.stage === "cerrado_perdido" && prospect.lostReason && (
          <p>Razón: <span className="font-medium">{LOST_REASON_LABELS[prospect.lostReason] ?? prospect.lostReason}</span></p>
        )}
      </div>
    </>
  );
}
