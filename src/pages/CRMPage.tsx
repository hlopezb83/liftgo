import { useState, useCallback, useMemo } from "react";
import { DragDropContext, Droppable, Draggable, type DropResult } from "@hello-pangea/dnd";
import { Plus, Building2, User, DollarSign, FileText, Calendar } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PageTransition } from "@/components/PageTransition";
import { ProspectFormDialog } from "@/components/crm/ProspectFormDialog";
import { ProspectDetailSheet } from "@/components/crm/ProspectDetailSheet";
import { useProspects, useCreateProspect, useUpdateProspect, useDeleteProspect, type Prospect } from "@/hooks/useProspects";
import { useQuotes } from "@/hooks/useQuotes";
import { useUserRole } from "@/hooks/useUserRole";
import { formatCurrency } from "@/lib/formatCurrency";
import { toast } from "@/hooks/use-toast";

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
  const { data: role } = useUserRole();
  const createProspect = useCreateProspect();
  const updateProspect = useUpdateProspect();
  const deleteProspect = useDeleteProspect();
  const navigate = useNavigate();

  const canCloseDeal = role === "admin" || role === "administrativo";

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingProspect, setEditingProspect] = useState<Prospect | null>(null);
  const [detailProspect, setDetailProspect] = useState<Prospect | null>(null);
  const [defaultStage, setDefaultStage] = useState("nuevo_prospecto");
  const [overrideStage, setOverrideStage] = useState<string | undefined>(undefined);
  const [creatorFilter, setCreatorFilter] = useState<string>("all");

  // Build a lookup map for quote_id -> quote_number
  const quoteMap = new Map(quotes.map((q) => [q.id, q.quote_number]));

  // Unique creators for the filter dropdown
  const creators = useMemo(() => {
    const map = new Map<string, string>();
    prospects.forEach((p) => {
      if (p.created_by && p.created_by_name) map.set(p.created_by, p.created_by_name);
    });
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [prospects]);

  const filteredProspects = creatorFilter === "all"
    ? prospects
    : prospects.filter((p) => p.created_by === creatorFilter);

  const prospectsByStage = STAGES.map((s) => ({
    ...s,
    items: filteredProspects.filter((p) => p.stage === s.key).sort((a, b) => a.stage_order - b.stage_order),
    total: filteredProspects.filter((p) => p.stage === s.key).reduce((sum, p) => sum + (p.deal_value ?? 0), 0),
  }));

  const onDragEnd = useCallback(
    (result: DropResult) => {
      if (!result.destination) return;
      const { draggableId, source, destination } = result;
      const newStage = destination.droppableId;
      if (newStage === "cerrado_ganado" && !canCloseDeal) {
        toast({ title: "Acceso restringido", description: "Solo usuarios administrativos pueden mover prospectos a Cerrado Ganado", variant: "destructive" });
        return;
      }
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
    [updateProspect, prospects, canCloseDeal]
  );

  const openCreate = (stage: string) => {
    if (stage === "cerrado_ganado" && !canCloseDeal) {
      toast({ title: "Acceso restringido", description: "Solo usuarios administrativos pueden crear prospectos en Cerrado Ganado", variant: "destructive" });
      return;
    }
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
                  <div key={stage.key} className="w-64 shrink-0 flex flex-col rounded-xl bg-muted/40 border">
                    <div className="px-3 py-3 border-b">
                      <div className="flex items-center gap-2">
                        <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: stage.color }} />
                        <span className="text-sm font-semibold">{stage.label}</span>
                        <span className="ml-auto text-xs text-muted-foreground bg-muted rounded-full px-2 py-0.5">
                          {stage.items.length}
                        </span>
                      </div>
                      <p className="text-xs font-medium text-muted-foreground mt-1">
                        {formatCurrency(stage.total)}
                      </p>
                    </div>

                    <Droppable droppableId={stage.key}>
                      {(provided, snapshot) => (
                        <ScrollArea className="flex-1">
                          <div
                            ref={provided.innerRef}
                            {...provided.droppableProps}
                            className={`p-2 min-h-[200px] transition-colors ${snapshot.isDraggingOver ? "bg-accent/30" : ""}`}
                          >
                            {stage.items.map((prospect, index) => (
                              <Draggable key={prospect.id} draggableId={prospect.id} index={index}>
                                {(prov, snap) => (
                                  <Card
                                    ref={prov.innerRef}
                                    {...prov.draggableProps}
                                    {...prov.dragHandleProps}
                                    className={`mb-2 p-3 cursor-grab active:cursor-grabbing border hover:shadow-md transition-shadow ${snap.isDragging ? "shadow-lg rotate-1" : ""}`}
                                    onClick={() => setDetailProspect(prospect)}
                                  >
                                    <div className="flex items-start gap-2">
                                      <Building2 className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                                      <span className="text-sm font-semibold leading-tight">{prospect.company_name}</span>
                                    </div>
                                    {prospect.contact_person && (
                                      <div className="flex items-center gap-2 mt-1.5">
                                        <User className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                                        <span className="text-xs text-muted-foreground">{prospect.contact_person}</span>
                                      </div>
                                    )}
                                    {(prospect.created_by_name || prospect.created_at) && (
                                      <div className="flex items-center gap-2 mt-1.5 text-[11px] text-muted-foreground/60">
                                        {prospect.created_by_name && (
                                          <span className="flex items-center gap-1">
                                            <User className="h-3 w-3 shrink-0" />
                                            {prospect.created_by_name}
                                          </span>
                                        )}
                                        {prospect.created_at && (
                                          <span className="flex items-center gap-1">
                                            <Calendar className="h-3 w-3 shrink-0" />
                                            {format(new Date(prospect.created_at), "dd/MM/yyyy", { locale: es })}
                                          </span>
                                        )}
                                      </div>
                                    )}
                                    <div className="flex items-center gap-2 mt-1.5">
                                      <DollarSign className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                                      <span className="text-xs font-medium">{formatCurrency(prospect.deal_value ?? 0)}</span>
                                    </div>
                                    {prospect.quote_id && quoteMap.has(prospect.quote_id) && (
                                      <div className="mt-2">
                                        <Badge
                                          variant="secondary"
                                          className="text-xs cursor-pointer hover:bg-accent gap-1"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            navigate(`/quotes/${prospect.quote_id}`);
                                          }}
                                        >
                                          <FileText className="h-3 w-3" />
                                          {quoteMap.get(prospect.quote_id)}
                                        </Badge>
                                      </div>
                                    )}
                                  </Card>
                                )}
                              </Draggable>
                            ))}
                            {provided.placeholder}
                          </div>
                        </ScrollArea>
                      )}
                    </Droppable>

                    <div className="p-2 border-t">
                      <Button variant="ghost" size="sm" className="w-full text-muted-foreground" onClick={() => openCreate(stage.key)}>
                        <Plus className="h-3.5 w-3.5 mr-1" /> Agregar
                      </Button>
                    </div>
                  </div>
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
