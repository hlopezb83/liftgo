import {
  DndContext,
  DragOverlay,
  PointerSensor,
  KeyboardSensor,
  closestCorners,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { useState } from "react";
import { ACTIVE_STAGES } from "../lib/constants";
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
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const activeProspect = activeId
    ? stagesData.flatMap((s) => s.items).find((p) => p.id === activeId)
    : null;

  if (isLoading) {
    return (
      <div className="flex gap-4">
        {ACTIVE_STAGES.map((s) => (
          <div key={s.key} className="w-64 shrink-0 rounded-xl bg-muted/50 animate-pulse h-96" />
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
