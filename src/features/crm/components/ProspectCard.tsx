import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, InfoAlertIcon } from "@/components/icons";
import { Card } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ProspectCardCompact, ProspectCardExpanded } from "./ProspectCardParts";
import type { Prospect } from "../hooks/useProspects";

interface ProspectCardProps {
  prospect: Prospect;
  quoteNumber?: string;
  density: "comfortable" | "compact";
  onClick: () => void;
  canWrite: boolean;
}

export function ProspectCard({ prospect, quoteNumber, density, onClick, canWrite }: ProspectCardProps) {
  const isCompact = density === "compact";

  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id: prospect.id,
    data: { type: "card", stage: prospect.stage },
    disabled: !canWrite,
  });

  const style = {
    // `CSS.Transform.toString` (vs `Translate`) es la variante recomendada por
    // dnd-kit para `useSortable`: además del translate serializa scaleX/scaleY
    // que emiten estrategias no-verticales y evita jitter cuando el activator
    // cambia entre drag/keyboard.
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };
  const openProspect = () => { if (!isDragging) onClick(); };
  const dragHandle = canWrite ? (
    <button type="button" ref={setActivatorNodeRef} {...attributes} {...listeners}
      aria-label={`Mover prospecto ${prospect.companyName}`}
      title="Mover prospecto: espacio para tomar, flechas para mover y espacio para soltar"
      className="ml-auto inline-flex h-8 w-8 touch:h-11 touch:w-11 shrink-0 touch-none items-center justify-center rounded-sm text-muted-foreground cursor-grab active:cursor-grabbing hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      onClick={(event) => event.stopPropagation()}>
      <GripVertical className="h-4 w-4" />
    </button>
  ) : null;

  return (
    <div
      ref={setNodeRef}
      style={style}
      data-testid={`crm-kanban-card-${prospect.id}`}
    >

      <Card
        className={`relative mb-2 ${isCompact ? "p-2" : "p-3"} cursor-pointer border hover:shadow-md transition-shadow`}
        onClick={openProspect}
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
          ? <ProspectCardCompact prospect={prospect} onOpen={openProspect} action={dragHandle} />
          : <ProspectCardExpanded prospect={prospect} quoteNumber={quoteNumber} onOpen={openProspect} action={dragHandle} />}
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
