import { useState } from "react";
import { useEquipmentModels, useCreateEquipmentModel, useUpdateEquipmentModel, useDeleteEquipmentModel, EquipmentModel } from "@/features/fleet/hooks/useEquipmentModels";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { DataTable } from "@/components/DataTable";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { FUEL_TYPES, FUEL_TYPE_LABELS } from "@/lib/constants";

export function EquipmentModelsTab() {
  const { data: models, isLoading } = useEquipmentModels();
  const create = useCreateEquipmentModel();
  const update = useUpdateEquipmentModel();
  const del = useDeleteEquipmentModel();
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const emptyForm = { manufacturer: "", model: "", default_capacity_kg: "", default_mast_height_m: "", default_fuel_type: "Diesel", default_daily_rate: "", default_weekly_rate: "", default_monthly_rate: "" };
  const [form, setForm] = useState(emptyForm);
  const set = (key: string, value: string) => setForm((p) => ({ ...p, [key]: value }));

  const openNew = () => { setEditId(null); setForm(emptyForm); setOpen(true); };
  const openEdit = (m: EquipmentModel) => {
    setEditId(m.id);
    setForm({ manufacturer: m.manufacturer, model: m.model, default_capacity_kg: m.default_capacity_kg?.toString() ?? "", default_mast_height_m: m.default_mast_height_m?.toString() ?? "", default_fuel_type: m.default_fuel_type, default_daily_rate: m.default_daily_rate?.toString() ?? "", default_weekly_rate: m.default_weekly_rate?.toString() ?? "", default_monthly_rate: m.default_monthly_rate?.toString() ?? "" });
    setOpen(true);
  };

  const handleSubmit = () => {
    if (!form.manufacturer || !form.model) { toast.error("Fabricante y modelo son requeridos"); return; }
    const payload = { manufacturer: form.manufacturer, model: form.model, default_capacity_kg: form.default_capacity_kg ? parseFloat(form.default_capacity_kg) : null, default_mast_height_m: form.default_mast_height_m ? parseFloat(form.default_mast_height_m) : null, default_fuel_type: form.default_fuel_type, default_daily_rate: form.default_daily_rate ? parseFloat(form.default_daily_rate) : 0, default_weekly_rate: form.default_weekly_rate ? parseFloat(form.default_weekly_rate) : 0, default_monthly_rate: form.default_monthly_rate ? parseFloat(form.default_monthly_rate) : 0 };
    if (editId) {
      update.mutate({ id: editId, ...payload }, { onSuccess: () => { toast.success("Actualizado"); setOpen(false); } });
    } else {
      create.mutate(payload, { onSuccess: () => { toast.success("Agregado"); setOpen(false); } });
    }
  };

  return (
    <div>
      <div className="flex justify-end mb-4">
        <Button onClick={openNew} size="sm"><Plus className="h-4 w-4 mr-2" />Agregar Modelo</Button>
      </div>
      <DataTable
        data={models}
        isLoading={isLoading}
        keyExtractor={(m) => m.id}
        emptyMessage="No hay modelos de equipo configurados"
        defaultSortKey="manufacturer"
        columns={[
          { key: "manufacturer", label: "Fabricante", sortable: true, render: (m) => <span className="font-medium">{m.manufacturer}</span> },
          { key: "model", label: "Modelo", sortable: true, render: (m) => m.model },
          { key: "default_capacity_kg", label: "Capacidad (kg)", align: "right", sortable: true, render: (m) => m.default_capacity_kg ?? "—" },
          { key: "default_mast_height_m", label: "Altura Mástil (m)", align: "right", sortable: true, render: (m) => m.default_mast_height_m ?? "—" },
          { key: "default_fuel_type", label: "Combustible", sortable: true, render: (m) => FUEL_TYPE_LABELS[m.default_fuel_type] || m.default_fuel_type },
          { key: "actions", label: "", render: (m) => (
            <div className="flex gap-1">
              <Button variant="ghost" size="icon" onClick={() => openEdit(m)}><Pencil className="h-4 w-4" /></Button>
              <AlertDialog>
                <AlertDialogTrigger asChild><Button variant="ghost" size="icon"><Trash2 className="h-4 w-4 text-destructive" /></Button></AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader><AlertDialogTitle>¿Eliminar {m.manufacturer} {m.model}?</AlertDialogTitle><AlertDialogDescription>Esto no afectará los montacargas existentes.</AlertDialogDescription></AlertDialogHeader>
                  <AlertDialogFooter><AlertDialogCancel>Cancelar</AlertDialogCancel><AlertDialogAction onClick={() => del.mutate(m.id, { onSuccess: () => toast.success("Eliminado") })}>Eliminar</AlertDialogAction></AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          ) },
        ]}
      />
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editId ? "Editar" : "Agregar"} Modelo de Equipo</DialogTitle><DialogDescription>Define una combinación de fabricante/modelo con especificaciones predeterminadas.</DialogDescription></DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="space-y-1.5"><Label>Fabricante *</Label><Input placeholder="ej. Hyster" value={form.manufacturer} onChange={(e) => set("manufacturer", e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Modelo *</Label><Input placeholder="ej. H50" value={form.model} onChange={(e) => set("model", e.target.value)} /></div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5"><Label>Capacidad (kg)</Label><Input type="number" placeholder="2500" value={form.default_capacity_kg} onChange={(e) => set("default_capacity_kg", e.target.value)} /></div>
              <div className="space-y-1.5"><Label>Altura Mástil (m)</Label><Input type="number" placeholder="4.5" value={form.default_mast_height_m} onChange={(e) => set("default_mast_height_m", e.target.value)} /></div>
            </div>
            <div className="space-y-1.5">
              <Label>Combustible</Label>
              <Select value={form.default_fuel_type} onValueChange={(v) => set("default_fuel_type", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{FUEL_TYPES.map((f) => <SelectItem key={f} value={f}>{FUEL_TYPE_LABELS[f] || f}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-1.5"><Label>Tarifa Diaria</Label><Input type="number" placeholder="0" value={form.default_daily_rate} onChange={(e) => set("default_daily_rate", e.target.value)} /></div>
              <div className="space-y-1.5"><Label>Tarifa Semanal</Label><Input type="number" placeholder="0" value={form.default_weekly_rate} onChange={(e) => set("default_weekly_rate", e.target.value)} /></div>
              <div className="space-y-1.5"><Label>Tarifa Mensual</Label><Input type="number" placeholder="0" value={form.default_monthly_rate} onChange={(e) => set("default_monthly_rate", e.target.value)} /></div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={handleSubmit} disabled={create.isPending || update.isPending}>{editId ? "Guardar" : "Agregar"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
