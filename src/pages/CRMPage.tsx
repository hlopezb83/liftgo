import { useState, useCallback, useMemo } from "react";
import { DragDropContext, type DropResult } from "@hello-pangea/dnd";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PageTransition } from "@/components/PageTransition";
import { ProspectFormDialog } from "@/components/crm/ProspectFormDialog";
import { ProspectDetailSheet } from "@/components/crm/ProspectDetailSheet";
import { KanbanColumn } from "@/components/crm/KanbanColumn";
import { useProspects, useCreateProspect, useUpdateProspect, useDeleteProspect, type Prospect } from "@/hooks/useProspects";
import { useQuotes } from "@/hooks/useQuotes";
import { useProspectGuard } from "@/hooks/crm/useProspectGuard";

const STAGES = [
  { key: "nuevo_prospecto", label: "Nuevo Prospecto", color: "hsl(var(--primary))" },
  { key: "contactado", label: "Contactado", color: "hsl(210 80% 55%)" },
  { key: "cotizacion_enviada", label: "Cotización Enviada", color: "hsl(45 93% 47%)" },
  { key: "negociacion", label: "Negociación", color: "hsl(280 60% 55%)" },
  { key: "cerrado_ganado", label: "Cerrado Ganado", color: "hsl(142 71% 45%)" },
  { key: "cerrado_perdido", label: "Cerrado Perdido", color: "hsl(0 72% 51%)" },
] as const;

export default function CRMPage() {
  const { data: prospects = [], isLoading } = useProspects();
  const { data: quotes = [] } = useQuotes();
  const { canCloseDeal, assertCanClose } = useProspectGuard();
  const createProspect = useCreateProspect();
  const updateProspect = useUpdateProspect();
  const deleteProspect = useDeleteProspect();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingProspect, setEditingProspect] = useState<Prospect | null>(null);
  const [detailProspect, setDetailProspect] = useState<Prospect | null>(null);
  const [defaultStage, setDefaultStage] = useState("nuevo_prospecto");
  const [overrideStage, setOverrideStage] = useState<string | undefined>(undefined);
  const [creatorFilter, setCreatorFilter] = useState<string>("all");

  const quoteMap = useMemo(() => new Map(quotes.map((q) => [q.id, q.quote_number])), [quotes]);

  const creators = useMemo(() => {
    const map = new Map<string, string>();
    prospects.forEach((p) => {
      if (p.created_by && p.created_by_name) map.set(p.created_by, p.created_by_name);
    });
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [prospects]);

  const filteredProspects = useMemo(
    () => (creatorFilter === "all" ? prospects : prospects.filter((p) => p.created_by === creatorFilter)),
    [prospects, creatorFilter]
  );

  const prospectsByStage = useMemo(
    () =>
      STAGES.map((s) => {
        const items = filteredProspects.filter((p) => p.stage === s.key).sort((a, b) => a.stage_order - b.stage_order);
        return {
          ...s,
          items,
          total: items.reduce((sum, p) => sum + (p.deal_value ?? 0), 0),
        };
      }),
    [filteredProspects]
  );

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

  return (
    <PageTransition>
      <div className="flex flex-col h-[calc(100vh-3rem)]">
        <div className="flex items-center justify-between px-6 py-4 border-b bg-card">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Pipeline CRM</h1>
            <p className="text-sm text-muted-foreground">Gestión de prospectos de venta</p>
          </div>
          <div className="flex items-center gap-3">
            {creators.length > 0 && (
              <Select value={creatorFilter} onValueChange={setCreatorFilter}>
                <SelectTrigger className="w-[180px] h-9 text-sm">
                  <SelectValue placeholder="Filtrar por creador" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos los usuarios</SelectItem>
                  {creators.map(([id, name]) => (
                    <SelectItem key={id} value={id}>{name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <Button onClick={() => openCreate("nuevo_prospecto")}>
              <Plus className="h-4 w-4 mr-2" /> Nuevo Prospecto
            </Button>
          </div>
        </div>

        <div className="flex-1 overflow-x-auto p-4">
          {isLoading ? (
            <div className="flex gap-4">
              {STAGES.map((s) => (
                <div key={s.key} className="w-64 shrink-0 rounded-xl bg-muted/50 animate-pulse h-96" />
              ))}
            </div>
          ) : (
            <DragDropContext onDragEnd={onDragEnd}>
              <div className="flex gap-4 h-full min-w-max">
                {prospectsByStage.map((stage) => (
                  <KanbanColumn
                    key={stage.key}
                    stageKey={stage.key}
                    label={stage.label}
                    color={stage.color}
                    items={stage.items}
                    total={stage.total}
                    quoteMap={quoteMap}
                    onAdd={() => openCreate(stage.key)}
                    onCardClick={setDetailProspect}
                  />
                ))}
              </div>
            </DragDropContext>
          )}
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
          if (data.stage === "cerrado_ganado" && !canCloseDeal) {
            toast({ title: "Acceso restringido", description: "Solo usuarios administrativos pueden guardar prospectos en Cerrado Ganado", variant: "destructive" });
            return;
          }
          if (editingProspect) {
            updateProspect.mutate({ id: editingProspect.id, ...data });
          } else {
            createProspect.mutate(data);
          }
        }}
        onDelete={editingProspect ? () => deleteProspect.mutate(editingProspect.id) : undefined}
      />
    </PageTransition>
  );
}
