import { Plus } from "lucide-react";
import { Droppable } from "@hello-pangea/dnd";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { formatCurrency } from "@/lib/formatCurrency";
import { ProspectCard } from "./ProspectCard";
import type { Prospect } from "@/hooks/useProspects";

interface KanbanColumnProps {
  stageKey: string;
  label: string;
  color: string;
  items: Prospect[];
  total: number;
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
  quoteMap,
  onAdd,
  onCardClick,
}: KanbanColumnProps) {
  return (
    <div className="w-64 shrink-0 flex flex-col rounded-xl bg-muted/40 border">
      <div className="px-3 py-3 border-b">
        <div className="flex items-center gap-2">
          <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} />
          <span className="text-sm font-semibold">{label}</span>
          <span className="ml-auto text-xs text-muted-foreground bg-muted rounded-full px-2 py-0.5">
            {items.length}
          </span>
        </div>
        <p className="text-xs font-medium text-muted-foreground mt-1">
          {formatCurrency(total)}
        </p>
      </div>

      <Droppable droppableId={stageKey}>
        {(provided, snapshot) => (
          <ScrollArea className="flex-1">
            <div
              ref={provided.innerRef}
              {...provided.droppableProps}
              className={`p-2 min-h-[200px] transition-colors ${snapshot.isDraggingOver ? "bg-accent/30" : ""}`}
            >
              {items.map((prospect, index) => (
                <ProspectCard
                  key={prospect.id}
                  prospect={prospect}
                  index={index}
                  quoteNumber={prospect.quote_id ? quoteMap.get(prospect.quote_id) : undefined}
                  onClick={() => onCardClick(prospect)}
                />
              ))}
              {provided.placeholder}
            </div>
          </ScrollArea>
        )}
      </Droppable>

      <div className="p-2 border-t">
        <Button variant="ghost" size="sm" className="w-full text-muted-foreground" onClick={onAdd}>
          <Plus className="h-3.5 w-3.5 mr-1" /> Agregar
        </Button>
      </div>
    </div>
  );
}
