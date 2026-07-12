import type { DragEndEvent } from "@dnd-kit/core";
import { useState } from "react";
import { PageTransition } from "@/components/layout/PageTransition";
import { TooltipProvider } from "@/components/ui/tooltip";
import { usePageActions } from "@/contexts/pageActions";
import { useQuotes } from "@/features/quotes";
import { formatCurrency } from "@/lib/format/formatCurrency";
import { CRMKanbanGrid } from "../components/CRMKanbanGrid";
import { CRMPageDialogs } from "../components/CRMPageDialogs";
import { CRMToolbar } from "../components/CRMToolbar";
import { useCRMFilters } from "../hooks/useCRMFilters";
import { useCRMMetrics } from "../hooks/useCRMMetrics";
import { useCRMPageDialogs } from "../hooks/useCRMPageDialogs";
import { useProspectGuard } from "../hooks/useProspectGuard";
import { useProspects, useCreateProspect, useUpdateProspect, useDeleteProspect, type Prospect } from "../hooks/useProspects";
import { ACTIVE_STAGES } from "../lib/constants";

export default function CRMPage() {
  const { data: prospects = [], isLoading } = useProspects();
  const { data: quotes = [] } = useQuotes();
  const { canCloseDeal, assertCanClose } = useProspectGuard();
  const createProspect = useCreateProspect();
  const updateProspect = useUpdateProspect();
  const deleteProspect = useDeleteProspect();
  const { data: metrics } = useCRMMetrics();
  const dialogs = useCRMPageDialogs();

  const [density, setDensity] = useState<"comfortable" | "compact">("comfortable");

  const activeProspects = prospects.filter(
    (p) => p.stage !== "cerrado_ganado" && p.stage !== "cerrado_perdido",
  );

  const { filters, update, reset, filtered, hasActive } = useCRMFilters(activeProspects);

  const quoteMap = new Map(quotes.map((q) => [q.id, q.quote_number]));

  const creatorMap = new Map<string, string>();
  activeProspects.forEach((p) => {
    if (p.createdBy && p.createdByName) creatorMap.set(p.createdBy, p.createdByName);
  });
  const creators: [string, string][] = [...creatorMap.entries()].sort((a, b) =>
    a[1].localeCompare(b[1]),
  );

  // `stagesData` es dep de `pipelineTotal` (y se pasa al Kanban). Mantenemos
  // memo manual para blindar la identidad ante remounts del subtree.
  const stagesData = ACTIVE_STAGES.map((s) => {
        const items = filtered
          .filter((p) => p.stage === s.key)
          .sort((a, b) => a.stageOrder - b.stageOrder);
        return { ...s, items, total: items.reduce((sum, p) => sum + (p.dealValue ?? 0), 0) };
      });

  const pipelineTotal = stagesData.reduce((s, c) => s + c.total, 0);

  const openCreate = (stage: string) => {
    if (stage === "cerrado_ganado" && !assertCanClose("create")) return;
    dialogs.setEditingProspect(null);
    dialogs.setDefaultStage(stage);
    dialogs.setOverrideStage(undefined);
    dialogs.setDialogOpen(true);
  };

  usePageActions({ onNew: () => openCreate("nuevo_prospecto"), newLabel: "Nuevo prospecto" });

  const openEdit = (p: Prospect) => {
    dialogs.setEditingProspect(p);
    dialogs.setOverrideStage(undefined);
    dialogs.setDialogOpen(true);
  };

  const onDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over) return;

    const draggableId = String(active.id);
    const sourceStage = (active.data.current?.stage as string | undefined) ?? null;

    // El "over" puede ser una columna (droppable) o una card (sortable). Resolvemos el stage destino.
    const overType = over.data.current?.type as "column" | "card" | undefined;
    const newStage =
      overType === "column"
        ? String(over.id)
        : (over.data.current?.stage as string | undefined) ?? String(over.id);

    if (!newStage || !sourceStage) return;
    if (newStage === "cerrado_ganado" && !assertCanClose("move")) return;

    if (sourceStage === newStage) {
      const newIndex = (over.data.current?.sortable?.index as number | undefined) ?? 0;
      updateProspect.mutate({ id: draggableId, stage_order: newIndex });
      return;
    }

    const prospect = prospects.find((p) => p.id === draggableId);
    if (prospect) {
      dialogs.setEditingProspect(prospect);
      dialogs.setOverrideStage(newStage);
      dialogs.setDialogOpen(true);
    }
  };

  return (
    <TooltipProvider delayDuration={300}>
      <PageTransition>
        <div className="flex flex-col h-[calc(100vh-3rem)]">
          <CRMToolbar
            filters={filters}
            update={update}
            reset={reset}
            hasActive={hasActive}
            creators={creators}
            density={density}
            setDensity={setDensity}
            metrics={metrics}
            onCreate={() => openCreate("nuevo_prospecto")}
            filteredCount={filtered.length}
            pipelineTotalLabel={formatCurrency(pipelineTotal)}
          />

          <div className="flex-1 relative">
            <div className="pointer-events-none absolute right-0 top-0 bottom-0 w-8 bg-gradient-to-l from-background to-transparent z-10" />
            <div className="h-full overflow-x-auto p-4 scroll-smooth">
              <CRMKanbanGrid
                isLoading={isLoading}
                stagesData={stagesData}
                pipelineTotal={pipelineTotal}
                density={density}
                quoteMap={quoteMap}
                onDragEnd={onDragEnd}
                onAdd={openCreate}
                onCardClick={dialogs.setDetailProspect}
              />
            </div>
          </div>
        </div>

        <CRMPageDialogs
          dialogs={dialogs}
          quoteMap={quoteMap}
          canCloseDeal={canCloseDeal}
          assertCanClose={assertCanClose}
          openEdit={openEdit}
          onCreate={(data) => createProspect.mutate(data)}
          onUpdate={(id, data) => updateProspect.mutate({ id, ...data })}
          onDelete={(id) => deleteProspect.mutate(id)}
        />
      </PageTransition>
    </TooltipProvider>
  );
}
