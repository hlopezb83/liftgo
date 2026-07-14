import { CompanyIcon, UserIcon, DocumentIcon, CalendarIcon } from "@/components/icons";
import { Badge } from "@/components/ui/badge";
import { useNavigateTransition } from "@/hooks/useNavigateTransition";
import { ROUTES } from "@/routes/routes";
import type { Prospect } from "../hooks/useProspects";

export function ProspectCardCompact({ prospect }: { prospect: Prospect }) {
  return (
    <div className="flex items-center justify-between gap-2 pr-3">
      <div className="flex items-center gap-1.5 min-w-0">
        <CompanyIcon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
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
  const navigate = useNavigateTransition();
  const showQuote = Boolean(prospect.quoteId && quoteNumber);
  const showFooter = Boolean(prospect.createdByName || prospect.createdAtLabel);

  return (
    <>
      <div className="flex items-start gap-2 pr-3">
        <CompanyIcon className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
        <span className="text-sm font-semibold leading-snug line-clamp-2">{prospect.companyName}</span>
      </div>
      {prospect.contactPerson && (
        <div className="flex items-center gap-2 mt-1">
          <UserIcon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
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
            className="text-2xs cursor-pointer hover:bg-accent gap-1"
            onClick={(e) => {
              e.stopPropagation();
              if (prospect.quoteId) navigate(ROUTES.quotes.detail(prospect.quoteId));
            }}
          >
            <DocumentIcon className="h-3 w-3" />
            {quoteNumber}
          </Badge>
        </div>
      )}
      {showFooter && (
        <div className="flex items-center gap-2 mt-2 pt-2 border-t text-3xs text-muted-foreground/70">
          {prospect.createdByName && (
            <span className="flex items-center gap-1 truncate">
              <UserIcon className="h-3 w-3 shrink-0" />
              {prospect.createdByName}
            </span>
          )}
          {prospect.createdAtLabel && (
            <span className="flex items-center gap-1 ml-auto shrink-0">
              <CalendarIcon className="h-3 w-3" />
              {prospect.createdAtLabel}
            </span>
          )}
        </div>
      )}
    </>
  );
}
