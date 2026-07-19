import { useState } from "react";
import { DataTableV2, useLiftgoTable, type ColumnDef } from "@/components/dataTable/v2";
import { FormDialog, FormDialogFooter } from "@/components/forms/FormDialog";
import { AddIcon, EditIcon, DeleteIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useEquipmentModels, useCreateEquipmentModel, useUpdateEquipmentModel, useDeleteEquipmentModel, EquipmentModel } from "@/features/fleet";
import { FUEL_TYPES, FUEL_TYPE_LABELS } from "@/lib/constants";
import { notifySuccess, notifyValidation } from "@/lib/ui/appFeedback";

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
    if (!form.manufacturer || !form.model) { notifyValidation({ message: "Fabricante y modelo son requeridos" }); return; }
    const payload = { manufacturer: form.manufacturer, model: form.model, default_capacity_kg: form.default_capacity_kg ? parseFloat(form.default_capacity_kg) : null, default_mast_height_m: form.default_mast_height_m ? parseFloat(form.default_mast_height_m) : null, default_fuel_type: form.default_fuel_type, default_daily_rate: form.default_daily_rate ? parseFloat(form.default_daily_rate) : 0, default_weekly_rate: form.default_weekly_rate ? parseFloat(form.default_weekly_rate) : 0, default_monthly_rate: form.default_monthly_rate ? parseFloat(form.default_monthly_rate) : 0 };
    if (editId) {
      update.mutate({ id: editId, ...payload }, { onSuccess: () => { notifySuccess("Actualizado"); setOpen(false); } });
    } else {
      create.mutate(payload, { onSuccess: () => { notifySuccess("Agregado"); setOpen(false); } });
    }
  };

  const columns: ColumnDef<EquipmentModel>[] = [
    { id: "manufacturer", header: "Fabricante", accessorKey: "manufacturer", cell: ({ row }) => <span className="font-medium">{row.original.manufacturer}</span> },
    { id: "model", header: "Modelo", accessorKey: "model", cell: ({ row }) => row.original.model },
    { id: "default_capacity_kg", header: "Capacidad (kg)", accessorKey: "default_capacity_kg", meta: { align: "right" }, cell: ({ row }) => row.original.default_capacity_kg ?? "—" },
    { id: "default_mast_height_m", header: "Altura Mástil (m)", accessorKey: "default_mast_height_m", meta: { align: "right" }, cell: ({ row }) => row.original.default_mast_height_m ?? "—" },
    { id: "default_fuel_type", header: "Combustible", accessorKey: "default_fuel_type", cell: ({ row }) => FUEL_TYPE_LABELS[row.original.default_fuel_type] || row.original.default_fuel_type },
    {
      id: "actions",
      header: "",
      enableSorting: false,
      cell: ({ row }) => (
        <EquipmentModelRowActions
          model={row.original}
          onEdit={() => openEdit(row.original)}
          onDelete={() => del.mutate(row.original.id, { onSuccess: () => notifySuccess("Eliminado") })}
        />
      ),
    },
  ];


  const table = useLiftgoTable<EquipmentModel>({
    data: models,
    columns,
    getRowId: (m) => m.id,
    initialSorting: [{ id: "manufacturer", desc: false }],
    paginated: false,
  });

  return (
    <div>
      <div className="flex justify-end mb-4">
        <Button onClick={openNew} size="sm"><AddIcon className="h-4 w-4 mr-2" />Agregar Modelo</Button>
      </div>
      <DataTableV2 table={table} isLoading={isLoading} emptyMessage="No hay modelos de equipo configurados" />
      <FormDialog open={open} onOpenChange={setOpen} title={`${editId ? "Editar" : "Nuevo"} Modelo de Equipo`} description="Define una combinación de fabricante/modelo con especificaciones predeterminadas.">
          <div className="grid gap-4 py-2">
            <div className="space-y-1.5"><Label>Fabricante *</Label><Input placeholder="ej. Hyster" value={form.manufacturer} onChange={(e) => set("manufacturer", e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Modelo *</Label><Input placeholder="ej. H50" value={form.model} onChange={(e) => set("model", e.target.value)} /></div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="space-y-1.5"><Label>Tarifa Diaria</Label><Input type="number" placeholder="0" value={form.default_daily_rate} onChange={(e) => set("default_daily_rate", e.target.value)} /></div>
              <div className="space-y-1.5"><Label>Tarifa Semanal</Label><Input type="number" placeholder="0" value={form.default_weekly_rate} onChange={(e) => set("default_weekly_rate", e.target.value)} /></div>
              <div className="space-y-1.5"><Label>Tarifa Mensual</Label><Input type="number" placeholder="0" value={form.default_monthly_rate} onChange={(e) => set("default_monthly_rate", e.target.value)} /></div>
            </div>
          </div>
          <FormDialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={handleSubmit} disabled={create.isPending || update.isPending}>{editId ? "Guardar" : "Agregar"}</Button>
          </FormDialogFooter>
        </FormDialog>
    </div>
  );
}

function EquipmentModelRowActions({ model, onEdit, onDelete }: { model: EquipmentModel; onEdit: () => void; onDelete: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="flex gap-1">
      <Button variant="ghost" size="icon" aria-label="Editar modelo" title="Editar modelo" onClick={onEdit}><EditIcon className="h-4 w-4" /></Button>
      <Button variant="ghost" size="icon" aria-label="Eliminar modelo" title="Eliminar modelo" onClick={() => setOpen(true)}><DeleteIcon className="h-4 w-4 text-destructive" /></Button>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title={`¿Eliminar ${model.manufacturer} ${model.model}?`}
        description="Esto no afectará los montacargas existentes."
        confirmLabel="Eliminar"
        destructive
        onConfirm={onDelete}
      />
    </div>
  );
}
