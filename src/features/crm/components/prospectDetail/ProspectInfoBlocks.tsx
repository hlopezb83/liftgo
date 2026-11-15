import { DocumentIcon, StickyNote } from "@/components/icons";
import { badgeVariants } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { formatCurrency } from "@/lib/format/formatCurrency";
import { Link } from "@/lib/router-compat-ui";
import { cn } from "@/lib/utils";
import { LOST_REASON_LABELS } from "../../lib/constants";
import type { Prospect } from "../../hooks/useProspects";

interface Props {
  prospect: Prospect;
  quoteNumber?: string;
  onNavigate: () => void;
}

export function ProspectQuoteLink({ prospect, quoteNumber, onNavigate }: Props) {
  if (!prospect.quoteId) return null;
  return (
    <>
      <Separator />
      <div className="flex items-start gap-3 py-2">
        <DocumentIcon className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
        <div>
          <p className="text-xs text-muted-foreground">Cotización Vinculada</p>
          <Link
            to={`/quotes/${prospect.quoteId}`}
            className={cn(badgeVariants({ variant: "secondary" }), "gap-1 mt-1 hover:bg-accent")}
            onClick={(event) => {
              if (event.button === 0 && !event.defaultPrevented && !event.metaKey && !event.altKey && !event.ctrlKey && !event.shiftKey) onNavigate();
            }}
          >
            <DocumentIcon className="h-3 w-3" />
            {quoteNumber ?? "Ver cotización vinculada"}
          </Link>
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
