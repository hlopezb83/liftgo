import { useState } from "react";
import { PageTransition } from "@/components/PageTransition";
import { useForklifts, useMaintenanceLogs, useCreateMaintenanceLog } from "@/hooks/useForkliftData";
import { usePagination } from "@/hooks/usePagination";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PageHeader } from "@/components/PageHeader";
import { TableSkeleton } from "@/components/TableSkeleton";
import { TablePagination } from "@/components/TablePagination";
import { EmptyRow } from "@/components/EmptyRow";
import { DatePickerField } from "@/components/DatePickerField";
import { FormActions } from "@/components/FormActions";
import { MarkAvailableDialog } from "@/components/MarkAvailableDialog";
import { useFormState } from "@/hooks/useFormState";
import { useActiveMechanics } from "@/hooks/useMechanics";
import { formatCurrency } from "@/lib/formatCurrency";
import { SERVICE_TYPES } from "@/lib/constants";
import { PlusCircle, Wrench, Download, Search } from "lucide-react";
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
  const [search, setSearch] = useState("");
  const [forkliftFilter, setForkliftFilter] = useState("all");

  const [availablePrompt, setAvailablePrompt] = useState<{ forkliftId: string; forkliftName: string } | null>(null);

  const forkliftMap = new Map(forklifts?.map((f) => [f.id, f]));

  const filtered = logs?.filter((log) => {
    const matchesSearch =
      log.service_type.toLowerCase().includes(search.toLowerCase()) ||
      (log.performed_by || "").toLowerCase().includes(search.toLowerCase()) ||
      (log.description || "").toLowerCase().includes(search.toLowerCase()) ||
      (forkliftMap.get(log.forklift_id)?.name || "").toLowerCase().includes(search.toLowerCase());
    const matchesForklift = forkliftFilter === "all" || log.forklift_id === forkliftFilter;
    return matchesSearch && matchesForklift;
  });

  const { page, setPage, totalPages, paginatedItems } = usePagination(filtered);

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
    <PageTransition>
    <div className="p-6 space-y-6">
      <PageHeader
        title="Mantenimiento"
        subtitle={`${logs?.length || 0} registros de servicio — ${formatCurrency(totalCost)} costo total`}
        action={
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => exportToCsv("mantenimiento.csv", (logs || []).map(l => ({ Fecha: l.performed_at, Montacargas: forkliftMap.get(l.forklift_id)?.name || "", Servicio: l.service_type, "Realizado Por": l.performed_by || "", Costo: l.cost || 0, "Próximo Servicio": l.next_service_date || "" })))}><Download className="h-4 w-4 mr-1" />Exportar CSV</Button>
            <Button onClick={() => { reset(); setDialogOpen(true); }} size="sm"><PlusCircle className="h-4 w-4 mr-1" /> Registrar Servicio</Button>
          </div>
        }
      />

      <div className="flex gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Buscar por servicio, técnico..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Select value={forkliftFilter} onValueChange={setForkliftFilter}>
          <SelectTrigger className="w-[200px]">
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

      <Card>
        <CardContent className="p-0">
          {isLoading ? <TableSkeleton /> : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fecha</TableHead><TableHead>Montacargas</TableHead><TableHead>Tipo de Servicio</TableHead>
                  <TableHead>Realizado Por</TableHead><TableHead className="text-right">Costo</TableHead><TableHead>Próximo Servicio</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedItems.map((log) => (
                  <TableRow key={log.id}>
                    <TableCell className="font-mono text-sm">{log.performed_at}</TableCell>
                    <TableCell className="font-medium">{forkliftMap.get(log.forklift_id)?.name || "—"}</TableCell>
                    <TableCell>{log.service_type}</TableCell>
                    <TableCell>{log.performed_by || "—"}</TableCell>
                    <TableCell className="text-right font-medium">{formatCurrency(log.cost || 0)}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{log.next_service_date || "—"}</TableCell>
                  </TableRow>
                ))}
                {paginatedItems.length === 0 && <EmptyRow colSpan={6} message="No se encontraron registros de mantenimiento" />}
              </TableBody>
            </Table>
          )}
          <TablePagination page={page} totalPages={totalPages} onPageChange={setPage} />
        </CardContent>
      </Card>

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
    </div>
    </PageTransition>
  );
}