import { Draggable } from "@hello-pangea/dnd";
import { Building2, User, FileText, Calendar, AlertCircle } from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { useNavigate } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { formatCurrency } from "@/lib/formatCurrency";
import { ROUTES } from "@/lib/routes";
import { getStaleDays } from "@/hooks/crm/useCRMFilters";
import type { Prospect } from "@/hooks/useProspects";

interface ProspectCardProps {
  prospect: Prospect;
  index: number;
  quoteNumber?: string;
  density: "comfortable" | "compact";
  onClick: () => void;
}

export function ProspectCard({ prospect, index, quoteNumber, density, onClick }: ProspectCardProps) {
  const navigate = useNavigate();
  const staleDays = getStaleDays(prospect.updated_at);
  const isStale = staleDays > 14 && !["cerrado_ganado", "cerrado_perdido"].includes(prospect.stage);
  const isCompact = density === "compact";

  return (
    <Draggable draggableId={prospect.id} index={index}>
      {(prov, snap) => (
        <Card
          ref={prov.innerRef}
          {...prov.draggableProps}
          {...prov.dragHandleProps}
          className={`relative mb-2 ${isCompact ? "p-2" : "p-3"} cursor-grab active:cursor-grabbing border hover:shadow-md transition-shadow ${snap.isDragging ? "shadow-lg rotate-1" : ""}`}
          onClick={onClick}
        >
          {isStale && (
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="absolute top-2 right-2 inline-flex items-center justify-center h-2 w-2 rounded-full bg-orange-500" />
              </TooltipTrigger>
              <TooltipContent side="left">
                <span className="flex items-center gap-1.5 text-xs">
                  <AlertCircle className="h-3 w-3" />
                  Sin movimiento hace {staleDays} días
                </span>
              </TooltipContent>
            </Tooltip>
          )}

          {isCompact ? (
            <div className="flex items-center justify-between gap-2 pr-3">
              <div className="flex items-center gap-1.5 min-w-0">
                <Building2 className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                <span className="text-xs font-semibold leading-tight truncate">{prospect.company_name}</span>
              </div>
              <span className="text-xs font-semibold tabular-nums shrink-0">
                {formatCurrency(prospect.deal_value ?? 0)}
              </span>
            </div>
          ) : (
            <>
              <div className="flex items-start gap-2 pr-3">
                <Building2 className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                <span className="text-sm font-semibold leading-snug line-clamp-2">{prospect.company_name}</span>
              </div>
              {prospect.contact_person && (
                <div className="flex items-center gap-2 mt-1">
                  <User className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  <span className="text-xs text-muted-foreground truncate">{prospect.contact_person}</span>
                </div>
              )}
              <div className="mt-2 text-sm font-semibold tabular-nums">
                {formatCurrency(prospect.deal_value ?? 0)}
              </div>
              {prospect.quote_id && quoteNumber && (
                <div className="mt-2">
                  <Badge
                    variant="secondary"
                    className="text-[11px] cursor-pointer hover:bg-accent gap-1"
                    onClick={(e) => {
                      e.stopPropagation();
                      navigate(ROUTES.quotes.detail(prospect.quote_id!));
                    }}
                  >
                    <FileText className="h-3 w-3" />
                    {quoteNumber}
                  </Badge>
                </div>
              )}
              {(prospect.created_by_name || prospect.created_at) && (
                <div className="flex items-center gap-2 mt-2 pt-2 border-t text-[10px] text-muted-foreground/70">
                  {prospect.created_by_name && (
                    <span className="flex items-center gap-1 truncate">
                      <User className="h-3 w-3 shrink-0" />
                      {prospect.created_by_name}
                    </span>
                  )}
                  {prospect.created_at && (
                    <span className="flex items-center gap-1 ml-auto shrink-0">
                      <Calendar className="h-3 w-3" />
                      {format(new Date(prospect.created_at), "dd/MM/yyyy", { locale: es })}
                    </span>
                  )}
                </div>
              )}
            </>
          )}
        </Card>
      )}
    </Draggable>
  );
}
