import { Building2, User, FileText, Calendar } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { ROUTES } from "@/lib/routes";
import type { Prospect } from "@/features/crm/hooks/useProspects";

export function ProspectCardCompact({ prospect }: { prospect: Prospect }) {
  return (
    <div className="flex items-center justify-between gap-2 pr-3">
      <div className="flex items-center gap-1.5 min-w-0">
        <Building2 className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        <span className="text-xs font-semibold leading-tight truncate">{prospect.companyName}</span>
      </div>
      <span className="text-xs font-semibold tabular-nums shrink-0">
        {prospect.dealValueLabel}
      </span>
    </div>
  );
}

interface ExpandedProps {
  prospect: Prospect;
  quoteNumber?: string;
}

export function ProspectCardExpanded({ prospect, quoteNumber }: ExpandedProps) {
  const navigate = useNavigate();
  const showQuote = Boolean(prospect.quoteId && quoteNumber);
  const showFooter = Boolean(prospect.createdByName || prospect.createdAtLabel);

  return (
    <>
      <div className="flex items-start gap-2 pr-3">
        <Building2 className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
        <span className="text-sm font-semibold leading-snug line-clamp-2">{prospect.companyName}</span>
      </div>
      {prospect.contactPerson && (
        <div className="flex items-center gap-2 mt-1">
          <User className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          <span className="text-xs text-muted-foreground truncate">{prospect.contactPerson}</span>
        </div>
      )}
      <div className="mt-2 text-sm font-semibold tabular-nums">
        {prospect.dealValueLabel}
      </div>
      {showQuote && (
        <div className="mt-2">
          <Badge
            variant="secondary"
            className="text-[11px] cursor-pointer hover:bg-accent gap-1"
            onClick={(e) => {
              e.stopPropagation();
              if (prospect.quoteId) navigate(ROUTES.quotes.detail(prospect.quoteId));
            }}
          >
            <FileText className="h-3 w-3" />
            {quoteNumber}
          </Badge>
        </div>
      )}
      {showFooter && (
        <div className="flex items-center gap-2 mt-2 pt-2 border-t text-[10px] text-muted-foreground/70">
          {prospect.createdByName && (
            <span className="flex items-center gap-1 truncate">
              <User className="h-3 w-3 shrink-0" />
              {prospect.createdByName}
            </span>
          )}
          {prospect.createdAtLabel && (
            <span className="flex items-center gap-1 ml-auto shrink-0">
              <Calendar className="h-3 w-3" />
              {prospect.createdAtLabel}
            </span>
          )}
        </div>
      )}
    </>
  );
}
