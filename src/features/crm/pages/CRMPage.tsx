import { useCallback, useMemo, useState } from "react";
import { type DropResult } from "@hello-pangea/dnd";
import { TooltipProvider } from "@/components/ui/tooltip";
import { PageTransition } from "@/components/PageTransition";
import { CRMPageDialogs } from "@/features/crm/components/CRMPageDialogs";
import { CRMKanbanGrid } from "@/features/crm/components/CRMKanbanGrid";
import { CRMToolbar } from "@/features/crm/components/CRMToolbar";
import { useProspects, useCreateProspect, useUpdateProspect, useDeleteProspect, type Prospect } from "@/features/crm/hooks/useProspects";
import { useQuotes } from "@/features/quotes/hooks/quotes/useQuotes";
import { useProspectGuard } from "@/features/crm/hooks/useProspectGuard";
import { useCRMFilters } from "@/features/crm/hooks/useCRMFilters";
import { useCRMMetrics } from "@/features/crm/hooks/useCRMMetrics";
import { useCRMPageDialogs } from "@/features/crm/hooks/useCRMPageDialogs";
import { ACTIVE_STAGES } from "@/features/crm/lib/constants";
import { formatCurrency } from "@/lib/formatCurrency";
import { usePageActions } from "@/contexts/PageActionsContext";

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

  const activeProspects = useMemo(
    () => prospects.filter((p) => p.stage !== "cerrado_ganado" && p.stage !== "cerrado_perdido"),
    [prospects]
  );

  const { filters, update, reset, filtered, hasActive } = useCRMFilters(activeProspects);

  const quoteMap = useMemo(() => new Map(quotes.map((q) => [q.id, q.quote_number])), [quotes]);

  const creators = useMemo<[string, string][]>(() => {
    const map = new Map<string, string>();
    activeProspects.forEach((p) => {
      if (p.createdBy && p.createdByName) map.set(p.createdBy, p.createdByName);
    });
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [activeProspects]);

  const stagesData = useMemo(
    () =>
      ACTIVE_STAGES.map((s) => {
        const items = filtered.filter((p) => p.stage === s.key).sort((a, b) => a.stageOrder - b.stageOrder);
        return { ...s, items, total: items.reduce((sum, p) => sum + (p.dealValue ?? 0), 0) };
      }),
    [filtered]
  );

  const pipelineTotal = useMemo(() => stagesData.reduce((s, c) => s + c.total, 0), [stagesData]);

  const openCreate = useCallback((stage: string) => {
    if (stage === "cerrado_ganado" && !assertCanClose("create")) return;
    dialogs.setEditingProspect(null);
    dialogs.setDefaultStage(stage);
    dialogs.setOverrideStage(undefined);
    dialogs.setDialogOpen(true);
  }, [assertCanClose, dialogs]);

  usePageActions({ onNew: () => openCreate("nuevo_prospecto"), newLabel: "Nuevo prospecto" });

  const openEdit = useCallback((p: Prospect) => {
    dialogs.setEditingProspect(p);
    dialogs.setOverrideStage(undefined);
    dialogs.setDialogOpen(true);
  }, [dialogs]);

  const onDragEnd = useCallback((result: DropResult) => {
    if (!result.destination) return;
    const { draggableId, source, destination } = result;
    const newStage = destination.droppableId;
    if (newStage === "cerrado_ganado" && !assertCanClose("move")) return;
    if (source.droppableId === newStage) {
      updateProspect.mutate({ id: draggableId, stage_order: destination.index });
      return;
    }
    const prospect = prospects.find((p) => p.id === draggableId);
    if (prospect) {
      dialogs.setEditingProspect(prospect);
      dialogs.setOverrideStage(newStage);
      dialogs.setDialogOpen(true);
    }
  }, [updateProspect, prospects, assertCanClose, dialogs]);

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
