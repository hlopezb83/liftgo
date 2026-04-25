import { Draggable } from "@hello-pangea/dnd";
import { Building2, User, DollarSign, FileText, Calendar } from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { useNavigate } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatCurrency } from "@/lib/formatCurrency";
import { ROUTES } from "@/lib/routes";
import type { Prospect } from "@/hooks/useProspects";

interface ProspectCardProps {
  prospect: Prospect;
  index: number;
  quoteNumber?: string;
  onClick: () => void;
}

export function ProspectCard({ prospect, index, quoteNumber, onClick }: ProspectCardProps) {
  const navigate = useNavigate();

  return (
    <Draggable draggableId={prospect.id} index={index}>
      {(prov, snap) => (
        <Card
          ref={prov.innerRef}
          {...prov.draggableProps}
          {...prov.dragHandleProps}
          className={`mb-2 p-3 cursor-grab active:cursor-grabbing border hover:shadow-md transition-shadow ${snap.isDragging ? "shadow-lg rotate-1" : ""}`}
          onClick={onClick}
        >
          <div className="flex items-start gap-2">
            <Building2 className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
            <span className="text-sm font-semibold leading-tight">{prospect.company_name}</span>
          </div>
          {prospect.contact_person && (
            <div className="flex items-center gap-2 mt-1.5">
              <User className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              <span className="text-xs text-muted-foreground">{prospect.contact_person}</span>
            </div>
          )}
          {(prospect.created_by_name || prospect.created_at) && (
            <div className="flex items-center gap-2 mt-1.5 text-[11px] text-muted-foreground/60">
              {prospect.created_by_name && (
                <span className="flex items-center gap-1">
                  <User className="h-3 w-3 shrink-0" />
                  {prospect.created_by_name}
                </span>
              )}
              {prospect.created_at && (
                <span className="flex items-center gap-1">
                  <Calendar className="h-3 w-3 shrink-0" />
                  {format(new Date(prospect.created_at), "dd/MM/yyyy", { locale: es })}
                </span>
              )}
            </div>
          )}
          <div className="flex items-center gap-2 mt-1.5">
            <DollarSign className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            <span className="text-xs font-medium">{formatCurrency(prospect.deal_value ?? 0)}</span>
          </div>
          {prospect.quote_id && quoteNumber && (
            <div className="mt-2">
              <Badge
                variant="secondary"
                className="text-xs cursor-pointer hover:bg-accent gap-1"
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
        </Card>
      )}
    </Draggable>
  );
}
