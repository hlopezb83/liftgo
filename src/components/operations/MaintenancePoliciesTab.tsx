import { useState } from "react";
import {
  useMaintenancePolicies,
  useCreateMaintenancePolicy,
  useUpdateMaintenancePolicy,
  useDeleteMaintenancePolicy,
  MaintenancePolicy,
} from "@/hooks/useMaintenancePolicies";
import { useForklifts } from "@/hooks/useForklifts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TableSkeleton } from "@/components/TableSkeleton";
import { EmptyRow } from "@/components/EmptyRow";

import { formatCurrency } from "@/lib/formatCurrency";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";

const emptyForm = {
  forklift_id: "",
  provider_name: "",
  monthly_cost: "",
  service_type: "Póliza de Mantenimiento",
  description: "",
};

export function MaintenancePoliciesTab() {
  const { data: policies, isLoading } = useMaintenancePolicies();
  const { data: forklifts } = useForklifts();
  const create = useCreateMaintenancePolicy();
  const update = useUpdateMaintenancePolicy();
  const del = useDeleteMaintenancePolicy();
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const set = (key: string, value: string) => setForm((p) => ({ ...p, [key]: value }));

  // Filter forklifts: show rented ones + any already assigned to a policy being edited
  const rentedForklifts = forklifts?.filter(
    (f) => f.status === "rented" || (editId && policies?.find((p) => p.id === editId)?.forklift_id === f.id)
  );

  const existingForkliftIds = policies?.map((p) => p.forklift_id) ?? [];
  const availableForSelect = rentedForklifts?.filter(
    (f) => !existingForkliftIds.includes(f.id) || (editId && policies?.find((p) => p.id === editId)?.forklift_id === f.id)
  );

  const openNew = () => { setEditId(null); setForm(emptyForm); setOpen(true); };
  const openEdit = (p: MaintenancePolicy) => {
    setEditId(p.id);
    setForm({
      forklift_id: p.forklift_id,
      provider_name: p.provider_name,
      monthly_cost: String(p.monthly_cost),
      service_type: p.service_type,
      description: p.description ?? "",
    });
    setOpen(true);
  };

  const handleSave = () => {
    if (!form.forklift_id || !form.provider_name) {
      toast.error("Montacargas y proveedor son requeridos");
      return;
    }
    const payload = {
      forklift_id: form.forklift_id,
      provider_name: form.provider_name,
      monthly_cost: parseFloat(form.monthly_cost) || 0,
      service_type: form.service_type || "Póliza de Mantenimiento",
      description: form.description || null,
    };
    if (editId) {
      update.mutate({ id: editId, ...payload }, { onSuccess: () => setOpen(false) });
    } else {
      create.mutate(payload, { onSuccess: () => setOpen(false) });
    }
  };

  const toggleActive = (p: MaintenancePolicy) => {
    update.mutate({ id: p.id, is_active: !p.is_active });
  };

  return (
    <div className="space-y-4 mt-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Configura pólizas de mantenimiento con proveedores externos. Se generará un registro automático cada mes para cada montacargas rentado con póliza activa.
        </p>
        <Button size="sm" onClick={openNew}><Plus className="h-4 w-4 mr-1" />Nueva Póliza</Button>
      </div>

      <div className="border rounded-lg">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Montacargas</TableHead>
              <TableHead>Proveedor</TableHead>
              <TableHead>Tipo de Servicio</TableHead>
              <TableHead className="text-right">Costo Mensual</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead>Último Mes Generado</TableHead>
              <TableHead className="w-[100px]" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? <TableSkeleton columnCount={7} /> : !policies?.length ? (
              <EmptyRow colSpan={7} message="No hay pólizas de mantenimiento configuradas" />
            ) : policies.map((p) => (
              <TableRow key={p.id}>
                <TableCell className="font-medium">{p.forklift_name}</TableCell>
                <TableCell>{p.provider_name}</TableCell>
                <TableCell>{p.service_type}</TableCell>
                <TableCell className="text-right font-mono">{formatCurrency(p.monthly_cost)}</TableCell>
                <TableCell>
                  <Switch checked={p.is_active} onCheckedChange={() => toggleActive(p)} />
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">{p.last_generated_month ?? "—"}</TableCell>
                <TableCell>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon" onClick={() => openEdit(p)}><Pencil className="h-4 w-4" /></Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="ghost" size="icon"><Trash2 className="h-4 w-4 text-destructive" /></Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>¿Eliminar póliza?</AlertDialogTitle>
                          <AlertDialogDescription>Se eliminará la póliza de {p.forklift_name}. Los registros de mantenimiento ya generados no se afectarán.</AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancelar</AlertDialogCancel>
                          <AlertDialogAction onClick={() => del.mutate(p.id)}>Eliminar</AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{editId ? "Editar" : "Nueva"} Póliza de Mantenimiento</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Montacargas *</Label>
              <Select value={form.forklift_id} onValueChange={(v) => set("forklift_id", v)}>
                <SelectTrigger><SelectValue placeholder="Seleccionar montacargas rentado" /></SelectTrigger>
                <SelectContent>
                  {availableForSelect?.map((f) => (
                    <SelectItem key={f.id} value={f.id}>{f.name} — {f.model}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Proveedor *</Label>
              <Input value={form.provider_name} onChange={(e) => set("provider_name", e.target.value)} placeholder="Nombre del proveedor externo" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Costo Mensual ($)</Label>
                <Input type="number" value={form.monthly_cost} onChange={(e) => set("monthly_cost", e.target.value)} placeholder="0" />
              </div>
              <div className="space-y-1.5">
                <Label>Tipo de Servicio</Label>
                <Input value={form.service_type} onChange={(e) => set("service_type", e.target.value)} placeholder="Póliza de Mantenimiento" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Descripción</Label>
              <Textarea value={form.description} onChange={(e) => set("description", e.target.value)} rows={2} placeholder="Detalles de la póliza..." />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={create.isPending || update.isPending}>
              {editId ? "Guardar" : "Crear"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
