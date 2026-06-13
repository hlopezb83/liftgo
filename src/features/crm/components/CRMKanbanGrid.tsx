import { DragDropContext, type DropResult } from "@hello-pangea/dnd";
import { KanbanColumn } from "./KanbanColumn";
import { ACTIVE_STAGES } from "../lib/constants";
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
  onDragEnd: (result: DropResult) => void;
  onAdd: (stageKey: string) => void;
  onCardClick: (p: Prospect) => void;
}

export function CRMKanbanGrid({
  isLoading, stagesData, pipelineTotal, density, quoteMap, onDragEnd, onAdd, onCardClick,
}: Props) {
  if (isLoading) {
    return (
      <div className="flex gap-4">
        {ACTIVE_STAGES.map((s) => (
          <div key={s.key} className="w-64 shrink-0 rounded-xl bg-muted/50 animate-pulse h-96" />
        ))}
      </div>
    );
  }
  return (
    <DragDropContext onDragEnd={onDragEnd}>
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
    </DragDropContext>
  );
}
