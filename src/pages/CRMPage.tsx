import { useState, useCallback, useMemo } from "react";
import { DragDropContext, type DropResult } from "@hello-pangea/dnd";
import { Plus, Search, X, LayoutGrid, Rows3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";
import { PageTransition } from "@/components/PageTransition";
import { ProspectFormDialog } from "@/components/crm/ProspectFormDialog";
import { ProspectDetailSheet } from "@/components/crm/ProspectDetailSheet";
import { KanbanColumn } from "@/components/crm/KanbanColumn";
import { CRMHeaderKPIs } from "@/components/crm/CRMHeaderKPIs";
import { useProspects, useCreateProspect, useUpdateProspect, useDeleteProspect, type Prospect } from "@/hooks/useProspects";
import { useQuotes } from "@/hooks/useQuotes";
import { useProspectGuard } from "@/hooks/crm/useProspectGuard";
import { useCRMFilters, type ValueRange, type AgeRange } from "@/hooks/crm/useCRMFilters";
import { useCRMMetrics } from "@/hooks/crm/useCRMMetrics";
import { formatCurrency } from "@/lib/formatCurrency";

const ACTIVE_STAGES = [
  { key: "nuevo_prospecto", label: "Nuevo Prospecto", color: "hsl(var(--primary))" },
  { key: "contactado", label: "Contactado", color: "hsl(210 80% 55%)" },
  { key: "cotizacion_enviada", label: "Cotización Enviada", color: "hsl(45 93% 47%)" },
  { key: "negociacion", label: "Negociación", color: "hsl(280 60% 55%)" },
] as const;

const VALUE_OPTIONS: { value: ValueRange; label: string }[] = [
  { value: "all", label: "Cualquier valor" },
  { value: "lt100k", label: "< $100k" },
  { value: "100k-500k", label: "$100k–$500k" },
  { value: "gt500k", label: "> $500k" },
];

const AGE_OPTIONS: { value: AgeRange; label: string }[] = [
  { value: "all", label: "Cualquier antigüedad" },
  { value: "week", label: "Esta semana" },
  { value: "month", label: "Este mes" },
  { value: "stale", label: "> 30 días" },
];

export default function CRMPage() {
  const { data: prospects = [], isLoading } = useProspects();
  const { data: quotes = [] } = useQuotes();
  const { canCloseDeal, assertCanClose } = useProspectGuard();
  const createProspect = useCreateProspect();
  const updateProspect = useUpdateProspect();
  const deleteProspect = useDeleteProspect();
  const { data: metrics } = useCRMMetrics();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingProspect, setEditingProspect] = useState<Prospect | null>(null);
  const [detailProspect, setDetailProspect] = useState<Prospect | null>(null);
  const [defaultStage, setDefaultStage] = useState("nuevo_prospecto");
  const [overrideStage, setOverrideStage] = useState<string | undefined>(undefined);
  const [density, setDensity] = useState<"comfortable" | "compact">("comfortable");

  // Pipeline only operates on active (open) prospects
  const activeProspects = useMemo(
    () => prospects.filter((p) => p.stage !== "cerrado_ganado" && p.stage !== "cerrado_perdido"),
    [prospects]
  );

  const { filters, update, reset, filtered, hasActive } = useCRMFilters(activeProspects);

  const quoteMap = useMemo(() => new Map(quotes.map((q) => [q.id, q.quote_number])), [quotes]);

  const creators = useMemo(() => {
    const map = new Map<string, string>();
    activeProspects.forEach((p) => {
      if (p.created_by && p.created_by_name) map.set(p.created_by, p.created_by_name);
    });
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [activeProspects]);

  const stagesData = useMemo(
    () =>
      ACTIVE_STAGES.map((s) => {
        const items = filtered.filter((p) => p.stage === s.key).sort((a, b) => a.stage_order - b.stage_order);
        return { ...s, items, total: items.reduce((sum, p) => sum + (p.deal_value ?? 0), 0) };
      }),
    [filtered]
  );

  const pipelineTotal = useMemo(() => stagesData.reduce((s, c) => s + c.total, 0), [stagesData]);
  const visibleStages = stagesData;

  const onDragEnd = useCallback(
    (result: DropResult) => {
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
        setEditingProspect(prospect);
        setOverrideStage(newStage);
        setDialogOpen(true);
      }
    },
    [updateProspect, prospects, assertCanClose]
  );

  const openCreate = (stage: string) => {
    if (stage === "cerrado_ganado" && !assertCanClose("create")) return;
    setEditingProspect(null);
    setDefaultStage(stage);
    setOverrideStage(undefined);
    setDialogOpen(true);
  };

  const openEdit = (p: Prospect) => {
    setEditingProspect(p);
    setOverrideStage(undefined);
    setDialogOpen(true);
  };

  const kanbanContent = isLoading ? (
    <div className="flex gap-4">
      {ACTIVE_STAGES.map((s) => (
        <div key={s.key} className="w-64 shrink-0 rounded-xl bg-muted/50 animate-pulse h-96" />
      ))}
    </div>
  ) : (
    <DragDropContext onDragEnd={onDragEnd}>
      <div className="flex gap-3 h-full min-w-max">
        {visibleStages.map((stage) => (
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
            onAdd={() => openCreate(stage.key)}
            onCardClick={setDetailProspect}
          />
        ))}
      </div>
    </DragDropContext>
  );

  return (
    <TooltipProvider delayDuration={300}>
      <PageTransition>
        <div className="flex flex-col h-[calc(100vh-3rem)]">
          <div className="px-6 py-3 border-b bg-card space-y-3">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div>
                <h1 className="text-2xl font-bold tracking-tight">Pipeline CRM</h1>
                <p className="text-xs text-muted-foreground">
                  {filtered.length} prospecto{filtered.length === 1 ? "" : "s"} · {formatCurrency(pipelineTotal)}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <ToggleGroup
                  type="single"
                  value={density}
                  onValueChange={(v) => v && setDensity(v as "comfortable" | "compact")}
                  size="sm"
                  variant="outline"
                >
                  <ToggleGroupItem value="comfortable" aria-label="Cómodo" className="h-9 px-2">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <LayoutGrid className="h-4 w-4" />
                      </TooltipTrigger>
                      <TooltipContent>Vista cómoda</TooltipContent>
                    </Tooltip>
                  </ToggleGroupItem>
                  <ToggleGroupItem value="compact" aria-label="Compacto" className="h-9 px-2">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Rows3 className="h-4 w-4" />
                      </TooltipTrigger>
                      <TooltipContent>Vista compacta</TooltipContent>
                    </Tooltip>
                  </ToggleGroupItem>
                </ToggleGroup>
                <Button onClick={() => openCreate("nuevo_prospecto")} size="sm" className="h-9">
                  <Plus className="h-4 w-4 mr-1" /> Nuevo Prospecto
                </Button>
              </div>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <div className="relative w-64">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  value={filters.search}
                  onChange={(e) => update("search", e.target.value)}
                  placeholder="Buscar empresa o contacto…"
                  className="h-8 pl-8 text-sm"
                />
              </div>

              {creators.length > 0 && (
                <Select value={filters.creator} onValueChange={(v) => update("creator", v)}>
                  <SelectTrigger className="w-[170px] h-8 text-sm">
                    <SelectValue placeholder="Creador" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos los usuarios</SelectItem>
                    {creators.map(([id, name]) => (
                      <SelectItem key={id} value={id}>{name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}

              <Select value={filters.valueRange} onValueChange={(v) => update("valueRange", v as ValueRange)}>
                <SelectTrigger className="w-[160px] h-8 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {VALUE_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={filters.ageRange} onValueChange={(v) => update("ageRange", v as AgeRange)}>
                <SelectTrigger className="w-[170px] h-8 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {AGE_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {hasActive && (
                <Button variant="ghost" size="sm" onClick={reset} className="h-8 text-xs">
                  <X className="h-3.5 w-3.5 mr-1" /> Limpiar
                </Button>
              )}

              <div className="ml-auto">
                <CRMHeaderKPIs metrics={metrics} />
              </div>
            </div>
          </div>

          <div className="flex-1 relative">
            <div className="pointer-events-none absolute right-0 top-0 bottom-0 w-8 bg-gradient-to-l from-background to-transparent z-10" />
            <div className="h-full overflow-x-auto p-4 scroll-smooth">
              {kanbanContent}
            </div>
          </div>
        </div>

        <ProspectDetailSheet
          prospect={detailProspect}
          open={!!detailProspect}
          onOpenChange={(open) => { if (!open) setDetailProspect(null); }}
          onEdit={(p) => {
            setDetailProspect(null);
            openEdit(p);
          }}
          quoteNumber={detailProspect?.quote_id ? quoteMap.get(detailProspect.quote_id) : undefined}
        />

        <ProspectFormDialog
          open={dialogOpen}
          onOpenChange={(open) => {
            setDialogOpen(open);
            if (!open) setOverrideStage(undefined);
          }}
          prospect={editingProspect}
          defaultStage={defaultStage}
          overrideStage={overrideStage}
          canCloseDeal={canCloseDeal}
          onSave={(data) => {
            if (data.stage === "cerrado_ganado" && !assertCanClose("save")) return;
            if (editingProspect) {
              updateProspect.mutate({ id: editingProspect.id, ...data });
            } else {
              createProspect.mutate(data);
            }
          }}
          onDelete={editingProspect ? () => deleteProspect.mutate(editingProspect.id) : undefined}
        />
      </PageTransition>
    </TooltipProvider>
  );
}
