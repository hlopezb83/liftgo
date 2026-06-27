import { Draggable } from "@hello-pangea/dnd";
import { AlertCircle } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ProspectCardCompact, ProspectCardExpanded } from "./ProspectCardParts";
import type { Prospect } from "../hooks/useProspects";

interface ProspectCardProps {
  prospect: Prospect;
  index: number;
  quoteNumber?: string;
  density: "comfortable" | "compact";
  onClick: () => void;
}

export function ProspectCard({ prospect, index, quoteNumber, density, onClick }: ProspectCardProps) {
  const isCompact = density === "compact";

  return (
    <Draggable draggableId={prospect.id} index={index}>
      {(prov, snap) => (
        <Card
          ref={prov.innerRef}
          {...(prov.draggableProps as unknown as React.HTMLAttributes<HTMLDivElement>)}
          {...(prov.dragHandleProps as unknown as React.HTMLAttributes<HTMLDivElement>)}
          className={`relative mb-2 ${isCompact ? "p-2" : "p-3"} cursor-grab active:cursor-grabbing border hover:shadow-md transition-shadow ${snap.isDragging ? "shadow-lg rotate-1" : ""}`}
          onClick={onClick}
        >
          {prospect.isStale && (
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="absolute top-2 right-2 inline-flex items-center justify-center h-2 w-2 rounded-full bg-orange-500" />
              </TooltipTrigger>
              <TooltipContent side="left">
                <span className="flex items-center gap-1.5 text-xs">
                  <AlertCircle className="h-3 w-3" />
                  Sin movimiento hace {prospect.staleDays} días
                </span>
              </TooltipContent>
            </Tooltip>
          )}

          {isCompact
            ? <ProspectCardCompact prospect={prospect} />
            : <ProspectCardExpanded prospect={prospect} quoteNumber={quoteNumber} />}
        </Card>
      )}
    </Draggable>
  );
}
