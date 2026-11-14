import { ROUTES } from "@/app-routes/routes";
import { CompanyIcon, UserIcon, DocumentIcon, CalendarIcon } from "@/components/icons";
import { Badge } from "@/components/ui/badge";
import { useNavigateTransition } from "@/hooks/useNavigateTransition";
import type { Prospect } from "../hooks/useProspects";
import type { ReactNode } from "react";

interface CardPartsProps {
  prospect: Prospect;
  onOpen?: () => void;
  action?: ReactNode;
}

function ProspectCompanyName({ prospect, onOpen, className }: Pick<CardPartsProps, "prospect" | "onOpen"> & { className: string }) {
  if (!onOpen) return <span className={className}>{prospect.companyName}</span>;
  return <button type="button" aria-label={`Ver prospecto ${prospect.companyName}`}
    className={`${className} min-w-0 text-left rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring`}
    onClick={(event) => { event.stopPropagation(); onOpen(); }}>{prospect.companyName}</button>;
}

export function ProspectCardCompact({ prospect, onOpen, action }: CardPartsProps) {
  return (
    <div className="flex items-center justify-between gap-2 pr-3">
      <div className="flex items-center gap-1.5 min-w-0">
        <CompanyIcon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        <ProspectCompanyName prospect={prospect} onOpen={onOpen} className="text-xs font-semibold leading-tight truncate" />
      </div>
      <span className="text-xs font-semibold tabular-nums shrink-0">
        {prospect.dealValueLabel}
      </span>
      {action}
    </div>
  );
}

interface ExpandedProps extends CardPartsProps {
  quoteNumber?: string;
}

export function ProspectCardExpanded({ prospect, quoteNumber, onOpen, action }: ExpandedProps) {
  const navigate = useNavigateTransition();
  const showQuote = Boolean(prospect.quoteId);
  const showFooter = Boolean(prospect.createdByName || prospect.createdAtLabel);

  return (
    <>
      <div className="flex items-start gap-2 pr-3">
        <CompanyIcon className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
        <ProspectCompanyName prospect={prospect} onOpen={onOpen} className="text-sm font-semibold leading-snug line-clamp-2" />
        {action}
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
            {quoteNumber ?? "Cotización vinculada"}
          </Badge>
        </div>
      )}
      {showFooter && (
        <div className="flex items-center gap-2 mt-2 pt-2 border-t text-xs text-muted-foreground">
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
