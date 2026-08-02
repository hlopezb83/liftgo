import {
  DndContext,
  DragOverlay,
  MeasuringStrategy,
  PointerSensor,
  KeyboardSensor,
  closestCorners,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { ACTIVE_STAGES } from "../lib/constants";
import { kanbanKeyboardCoordinates } from "../lib/kanbanKeyboardCoordinates";
import { KanbanColumn } from "./KanbanColumn";
import { ProspectCardOverlay } from "./ProspectCard";
import type { Prospect } from "../hooks/useProspects";

interface StageData {
  key: string;
  label: string;
  color: string;
  items: Prospect[];
  total: number;
}

interface Props {
  isLoading: boolean;
  stagesData: StageData[];
  pipelineTotal: number;
  density: "comfortable" | "compact";
  quoteMap: Map<string, string>;
  onDragEnd: (event: DragEndEvent) => void;
  onAdd: (stageKey: string) => void;
  onCardClick: (p: Prospect) => void;
}

export function CRMKanbanGrid({
  isLoading, stagesData, pipelineTotal, density, quoteMap, onDragEnd, onAdd, onCardClick,
}: Props) {
  const [activeId, setActiveId] = useState<string | null>(null);

  const sensors = useSensors(
    // R7-FE-08a (N7-MOV-09): ver MaintenanceKanban — distance 4 → 8.
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    // `scrollBehavior: "auto"` evita el scroll suave del sensor de teclado, que
    // retrasaba el cambio de columna varios cientos de ms.
    useSensor(KeyboardSensor, {
      coordinateGetter: kanbanKeyboardCoordinates,
      scrollBehavior: "auto",
    }),
  );

  const activeProspect = activeId
    ? stagesData.flatMap((s) => s.items).find((p) => p.id === activeId)
    : null;

  if (isLoading) {
    return (
      <div className="flex gap-3" role="status">
        <span className="sr-only">Cargando prospectos…</span>
        {ACTIVE_STAGES.map((s) => (
          <div key={s.key} className="w-64 shrink-0 rounded-xl border bg-card p-3">
            <div className="mb-3 flex items-center justify-between">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-4 w-10" />
            </div>
            <div className="space-y-2">
              {[0, 1, 2].map((i) => (
                <div key={i} className="rounded-lg border bg-background p-3 space-y-2">
                  <Skeleton className="h-3.5 w-3/4" />
                  <Skeleton className="h-3 w-1/2" />
                  <Skeleton className="h-3 w-2/5" />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  }

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(String(event.active.id));
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveId(null);
    onDragEnd(event);
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      // `MeasuringStrategy.Always` re-mide los droppables durante el drag; sin
      // esto SortableContext vertical cachea alturas al inicio y aparecen gaps
      // al reordenar cards de alturas variables.
      measuring={{ droppable: { strategy: MeasuringStrategy.Always } }}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={() => setActiveId(null)}
    >
      <div className="flex gap-3 h-full min-w-max">
        {stagesData.map((stage) => (
          <KanbanColumn
            key={stage.key}
            stageKey={stage.key}
            label={stage.label}
            color={stage.color}
            items={stage.items}
            total={stage.total}
            pipelineTotal={pipelineTotal}
            density={density}
            quoteMap={quoteMap}
            onAdd={() => onAdd(stage.key)}
            onCardClick={onCardClick}
          />
        ))}
      </div>
      <DragOverlay dropAnimation={null}>
        {activeProspect ? (
          <ProspectCardOverlay
            prospect={activeProspect}
            density={density}
            quoteNumber={activeProspect.quoteId ? quoteMap.get(activeProspect.quoteId) : undefined}
          />
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
