import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { AddIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { formatCurrency } from "@/lib/format/formatCurrency";
import { ProspectCard } from "./ProspectCard";
import type { Prospect } from "../hooks/useProspects";

interface KanbanColumnProps {
  stageKey: string;
  label: string;
  color: string;
  items: Prospect[];
  total: number;
  pipelineTotal: number;
  density: "comfortable" | "compact";
  quoteMap: Map<string, string>;
  onAdd: () => void;
  onCardClick: (p: Prospect) => void;
}

export function KanbanColumn({
  stageKey,
  label,
  color,
  items,
  total,
  pipelineTotal,
  density,
  quoteMap,
  onAdd,
  onCardClick,
}: KanbanColumnProps) {
  const pct = pipelineTotal > 0 ? Math.min(100, (total / pipelineTotal) * 100) : 0;

  const { setNodeRef, isOver } = useDroppable({
    id: stageKey,
    data: { type: "column", stage: stageKey },
  });

  const itemIds = items.map((p) => p.id);

  return (
    <div className="w-[clamp(220px,18vw,280px)] shrink-0 flex flex-col rounded-xl bg-muted/40 border">
      <div className="px-3 py-2.5 border-b">
        <div className="flex items-center gap-2">
          <div className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: color }} />
          <span className="text-sm font-semibold truncate">{label}</span>
          <span className="ml-auto text-xs text-muted-foreground bg-muted rounded-full px-2 py-0.5 shrink-0">
            {items.length}
          </span>
        </div>
        <p className="text-xs font-medium text-muted-foreground mt-1 tabular-nums">
          {formatCurrency(total)}
        </p>
        <div className="mt-1.5 h-1 w-full rounded-full bg-muted overflow-hidden">
          <div
            className="h-full rounded-full transition-all"
            style={{ width: `${pct}%`, backgroundColor: color }}
          />
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div
          ref={setNodeRef}
          className={`p-2 min-h-[200px] transition-colors ${isOver ? "bg-accent/30" : ""}`}
        >
          <SortableContext items={itemIds} strategy={verticalListSortingStrategy}>
            {items.map((prospect) => (
              <ProspectCard
                key={prospect.id}
                prospect={prospect}
                density={density}
                quoteNumber={prospect.quoteId ? quoteMap.get(prospect.quoteId) : undefined}
                onClick={() => onCardClick(prospect)}
              />
            ))}
          </SortableContext>
        </div>
      </ScrollArea>

      <div className="p-2 border-t">
        <Button variant="ghost" size="sm" className="w-full text-muted-foreground" onClick={onAdd}>
          <AddIcon className="h-3.5 w-3.5 mr-1" /> Agregar
        </Button>
      </div>
    </div>
  );
}
