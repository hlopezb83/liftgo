import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { InfoAlertIcon } from "@/components/icons";
import { Card } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ProspectCardCompact, ProspectCardExpanded } from "./ProspectCardParts";
import type { Prospect } from "../hooks/useProspects";

interface ProspectCardProps {
  prospect: Prospect;
  quoteNumber?: string;
  density: "comfortable" | "compact";
  onClick: () => void;
}

export function ProspectCard({ prospect, quoteNumber, density, onClick }: ProspectCardProps) {
  const isCompact = density === "compact";

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: prospect.id,
    data: { type: "card", stage: prospect.stage },
  });

  const style = {
    transform: CSS.Translate.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <Card
        className={`relative mb-2 ${isCompact ? "p-2" : "p-3"} cursor-grab active:cursor-grabbing border hover:shadow-md transition-shadow`}
        onClick={onClick}
      >
        {prospect.isStale && (
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="absolute top-2 right-2 inline-flex items-center justify-center h-2 w-2 rounded-full bg-warning" />
            </TooltipTrigger>
            <TooltipContent side="left">
              <span className="flex items-center gap-1.5 text-xs">
                <InfoAlertIcon className="h-3 w-3" />
                Sin movimiento hace {prospect.staleDays} días
              </span>
            </TooltipContent>
          </Tooltip>
        )}

        {isCompact
          ? <ProspectCardCompact prospect={prospect} />
          : <ProspectCardExpanded prospect={prospect} quoteNumber={quoteNumber} />}
      </Card>
    </div>
  );
}

/**
 * Versión estática usada por <DragOverlay/> (no requiere sortable context).
 */
export function ProspectCardOverlay({
  prospect,
  quoteNumber,
  density,
}: {
  prospect: Prospect;
  quoteNumber?: string;
  density: "comfortable" | "compact";
}) {
  const isCompact = density === "compact";
  return (
    <Card
      className={`relative mb-2 ${isCompact ? "p-2" : "p-3"} border shadow-lg rotate-1 cursor-grabbing`}
    >
      {isCompact
        ? <ProspectCardCompact prospect={prospect} />
        : <ProspectCardExpanded prospect={prospect} quoteNumber={quoteNumber} />}
    </Card>
  );
}
