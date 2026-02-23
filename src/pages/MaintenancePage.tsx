import { useState } from "react";
import { useForklifts } from "@/hooks/useForklifts";
import { useMaintenanceLogs, useCreateMaintenanceLog } from "@/hooks/useMaintenanceLogs";
import { usePagination } from "@/hooks/usePagination";
import { useListFilters } from "@/hooks/useListFilters";
import { ListPageLayout } from "@/components/ListPageLayout";
import { SearchBar } from "@/components/SearchBar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { TableRow, TableCell, TableHead } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DatePickerField } from "@/components/DatePickerField";
import { FormActions } from "@/components/FormActions";
import { MarkAvailableDialog } from "@/components/MarkAvailableDialog";
import { useFormState } from "@/hooks/useFormState";
import { useActiveMechanics } from "@/hooks/useMechanics";
import { formatCurrency } from "@/lib/formatCurrency";
import { SERVICE_TYPES } from "@/lib/constants";
import { Card, CardContent } from "@/components/ui/card";
import { useIsMobile } from "@/hooks/use-mobile";
import { PlusCircle, Wrench, Download } from "lucide-react";
import { exportToCsv } from "@/lib/exportCsv";
import { toast } from "sonner";
import { format } from "date-fns";

const initialForm = {
  forkliftId: "" as string,
  serviceType: "" as string,
  description: "" as string,
  cost: "" as string,
  performedBy: "" as string,
  performedAt: new Date() as Date,
  nextServiceDate: undefined as Date | undefined,
};

export default function MaintenancePage() {
  const { data: forklifts } = useForklifts();
  const { data: logs, isLoading } = useMaintenanceLogs();
  const { data: activeMechanics } = useActiveMechanics();
  const createLog = useCreateMaintenanceLog();
  const [dialogOpen, setDialogOpen] = useState(false);
  const { form, set, reset } = useFormState(initialForm);
  const [forkliftFilter, setForkliftFilter] = useState("all");
  const [availablePrompt, setAvailablePrompt] = useState<{ forkliftId: string; forkliftName: string } | null>(null);

  const forkliftMap = new Map(forklifts?.map((f) => [f.id, f]));

  // Enrich logs with forklift name for search
  const enrichedLogs = logs?.map((log) => ({
    ...log,
    forklift_name: forkliftMap.get(log.forklift_id)?.name || "",
  }));

  const { search, setSearch, filtered: searchFiltered } = useListFilters(enrichedLogs, {
    searchFields: ["service_type", "performed_by", "description", "forklift_name"],
  });

  // Apply forklift dropdown filter on top of search
  const filtered = searchFiltered?.filter((log) =>
    forkliftFilter === "all" || log.forklift_id === forkliftFilter
  );

  const { page, setPage, totalPages, paginatedItems } = usePagination(filtered);
  const isMobile = useIsMobile();

  const mobileContent = isMobile ? (
    <div className="space-y-3">
      {paginatedItems.length > 0 ? paginatedItems.map((log) => (
        <Card key={log.id}>
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-1">
              <span className="text-sm font-semibold">{log.service_type}</span>
              <span className="text-sm font-mono font-medium">{formatCurrency(log.cost || 0)}</span>
            </div>
            <p className="text-sm font-medium">{forkliftMap.get(log.forklift_id)?.name || "—"}</p>
            <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
              <span className="font-mono">{log.performed_at}</span>
              {log.performed_by && <span>por {log.performed_by}</span>}
            </div>
            {log.next_service_date && <p className="text-xs text-muted-foreground mt-1">Próx: {log.next_service_date}</p>}
          </CardContent>
        </Card>
      )) : (
        <Card><CardContent className="py-14 text-center text-sm text-muted-foreground">No se encontraron registros</CardContent></Card>
      )}
    </div>
  ) : undefined;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.forkliftId || !form.serviceType) { toast.error("Montacargas y tipo de servicio son requeridos"); return; }
    const selectedForklift = forkliftMap.get(form.forkliftId);
    createLog.mutate(
      {
        forklift_id: form.forkliftId, service_type: form.serviceType, description: form.description || null,
        cost: form.cost ? parseFloat(form.cost) : 0, performed_by: form.performedBy || null,
        performed_at: format(form.performedAt, "yyyy-MM-dd"),
        next_service_date: form.nextServiceDate ? format(form.nextServiceDate, "yyyy-MM-dd") : null,
      },
      {
        onSuccess: () => {
          toast.success("Registro de mantenimiento agregado");
          setDialogOpen(false);
          if (selectedForklift && selectedForklift.status === "maintenance") {
            setAvailablePrompt({ forkliftId: selectedForklift.id, forkliftName: selectedForklift.name });
          }
          reset();
        },
      }
    );
  };

  const totalCost = logs?.reduce((sum, l) => sum + (l.cost || 0), 0) || 0;

  return (
    <>
      <ListPageLayout
        title="Mantenimiento"
        subtitle={`${logs?.length || 0} registros de servicio — ${formatCurrency(totalCost)} costo total`}
        actions={
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => exportToCsv("mantenimiento.csv", (logs || []).map(l => ({ Fecha: l.performed_at, Montacargas: forkliftMap.get(l.forklift_id)?.name || "", Servicio: l.service_type, "Realizado Por": l.performed_by || "", Costo: l.cost || 0, "Próximo Servicio": l.next_service_date || "" })))}><Download className="h-4 w-4 mr-1" />Exportar CSV</Button>
            <Button onClick={() => { reset(); setDialogOpen(true); }} size="sm"><PlusCircle className="h-4 w-4 mr-1" /> Registrar Servicio</Button>
          </div>
        }
        filters={
          <div className="flex flex-col sm:flex-row gap-3">
            <SearchBar value={search} onChange={setSearch} placeholder="Buscar por servicio, técnico..." />
            <Select value={forkliftFilter} onValueChange={setForkliftFilter}>
              <SelectTrigger className="w-full sm:w-[200px]">
                <SelectValue placeholder="Todos los montacargas" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos los montacargas</SelectItem>
                {forklifts?.map((f) => (
                  <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        }
        isLoading={isLoading}
        items={paginatedItems}
        page={page}
        totalPages={totalPages}
        onPageChange={setPage}
        emptyMessage="No se encontraron registros de mantenimiento"
        tableHeader={
          <TableRow>
            <TableHead>Fecha</TableHead><TableHead>Montacargas</TableHead><TableHead>Tipo de Servicio</TableHead>
            <TableHead>Realizado Por</TableHead><TableHead className="text-right">Costo</TableHead><TableHead>Próximo Servicio</TableHead>
          </TableRow>
        }
        renderRow={(log) => (
          <TableRow key={log.id} className="hover:bg-muted/50 border-l-2 border-transparent hover:border-primary transition-colors">
            <TableCell className="font-mono text-sm">{log.performed_at}</TableCell>
            <TableCell className="font-medium">{forkliftMap.get(log.forklift_id)?.name || "—"}</TableCell>
            <TableCell>{log.service_type}</TableCell>
            <TableCell>{log.performed_by || "—"}</TableCell>
            <TableCell className="text-right font-medium">{formatCurrency(log.cost || 0)}</TableCell>
            <TableCell className="text-sm text-muted-foreground">{log.next_service_date || "—"}</TableCell>
          </TableRow>
        )}
        customContent={mobileContent}
      />

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><Wrench className="h-4 w-4" /> Registrar Mantenimiento</DialogTitle></DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label>Montacargas *</Label>
              <Select value={form.forkliftId} onValueChange={(v) => set("forkliftId", v)}>
                <SelectTrigger><SelectValue placeholder="Seleccionar montacargas" /></SelectTrigger>
                <SelectContent>{forklifts?.map((f) => <SelectItem key={f.id} value={f.id}>{f.name} — {f.model}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Tipo de Servicio *</Label>
              <Select value={form.serviceType} onValueChange={(v) => set("serviceType", v)}>
                <SelectTrigger><SelectValue placeholder="Seleccionar tipo de servicio" /></SelectTrigger>
                <SelectContent>{SERVICE_TYPES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Descripción</Label>
              <Textarea value={form.description} onChange={(e) => set("description", e.target.value)} placeholder="Detalles del servicio..." rows={3} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5"><Label>Costo ($)</Label><Input type="number" value={form.cost} onChange={(e) => set("cost", e.target.value)} placeholder="0" /></div>
              <div className="space-y-1.5">
                <Label>Realizado Por</Label>
                <Select value={form.performedBy} onValueChange={(v) => set("performedBy", v)}>
                  <SelectTrigger><SelectValue placeholder="Seleccionar mecánico" /></SelectTrigger>
                  <SelectContent>
                    {activeMechanics?.map((m) => <SelectItem key={m.id} value={m.name}>{m.name}{m.specialization ? ` (${m.specialization})` : ""}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <DatePickerField label="Fecha de Servicio" date={form.performedAt} onSelect={(d) => d && set("performedAt", d)} />
              <DatePickerField label="Próximo Servicio" date={form.nextServiceDate} onSelect={(d) => set("nextServiceDate", d)} placeholder="Opcional" />
            </div>
            <FormActions submitLabel="Agregar Registro" isPending={createLog.isPending} onCancel={() => setDialogOpen(false)} />
          </form>
        </DialogContent>
      </Dialog>

      {availablePrompt && (
        <MarkAvailableDialog
          open={!!availablePrompt}
          onOpenChange={(open) => { if (!open) setAvailablePrompt(null); }}
          forkliftId={availablePrompt.forkliftId}
          forkliftName={availablePrompt.forkliftName}
        />
      )}
    </>
  );
}
