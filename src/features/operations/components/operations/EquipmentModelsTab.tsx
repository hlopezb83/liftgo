import { useMemo, useState } from "react";
import { DataTableV2, useLiftgoTable, type ColumnDef } from "@/components/dataTable/v2";
import { QueryErrorState } from "@/components/feedback/QueryErrorState";
import { FormDialog, FormDialogFooter } from "@/components/forms/FormDialog";
import { FormDialogCancelButton } from "@/components/forms/FormDialogCancelButton";
import { AddIcon, EditIcon, DeleteIcon } from "@/components/icons";
import { MobileCardList } from "@/components/layout/MobileCardList";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  useActivateEquipmentModel,
  useDeleteEquipmentModel,
  useEquipmentModelCatalog,
  useEquipmentModels,
  useForklifts,
  useUpdateEquipmentModel,
  type EquipmentModel,
} from "@/features/fleet";
import { countUnitsForModel, validateNonNegative } from "@/features/operations/lib/equipmentModelValidation";
import { useIsMobile } from "@/hooks/use-mobile";
import { FUEL_TYPE_LABELS } from "@/lib/constants";
import { notifySuccess, notifyValidation } from "@/lib/ui/appFeedback";

type FormState = {
  catalogId: string;
  alias: string;
  daily: string;
  weekly: string;
  monthly: string;
};

const EMPTY: FormState = { catalogId: "", alias: "", daily: "", weekly: "", monthly: "" };

export function EquipmentModelsTab() {
  const isMobile = useIsMobile();
  const local = useEquipmentModels();
  const catalog = useEquipmentModelCatalog();
  const { data: forklifts } = useForklifts();
  const activate = useActivateEquipmentModel();
  const update = useUpdateEquipmentModel();
  const deactivate = useDeleteEquipmentModel();
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY);
  const set = (key: keyof FormState, value: string) => setForm((current) => ({ ...current, [key]: value }));

  const models = local.data ?? [];
  const forkliftList = useMemo(() => forklifts ?? [], [forklifts]);
  const countUnits = (model: EquipmentModel) =>
    countUnitsForModel(forkliftList, model.manufacturer, model.model);

  const openNew = () => { setEditId(null); setForm(EMPTY); setOpen(true); };
  const openEdit = (model: EquipmentModel) => {
    setEditId(model.id);
    setForm({
      catalogId: model.catalog_model_id ?? "",
      alias: model.local_alias ?? "",
      daily: model.default_daily_rate?.toString() ?? "",
      weekly: model.default_weekly_rate?.toString() ?? "",
      monthly: model.default_monthly_rate?.toString() ?? "",
    });
    setOpen(true);
  };

  const submit = () => {
    if (!editId && !form.catalogId) {
      notifyValidation({ message: "Selecciona un modelo del catálogo LiftGo" });
      return;
    }
    for (const [value, label] of [[form.daily, "Tarifa diaria"], [form.weekly, "Tarifa semanal"], [form.monthly, "Tarifa mensual"]] as const) {
      const error = validateNonNegative(value, label);
      if (error) { notifyValidation({ message: error }); return; }
    }
    const rates = {
      local_alias: form.alias.trim() || null,
      default_daily_rate: form.daily ? Number(form.daily) : 0,
      default_weekly_rate: form.weekly ? Number(form.weekly) : 0,
      default_monthly_rate: form.monthly ? Number(form.monthly) : 0,
    };
    if (editId) {
      update.mutate({ id: editId, ...rates }, {
        onSuccess: () => { notifySuccess("Configuración local actualizada"); setOpen(false); },
      });
    } else {
      activate.mutate({ catalog_model_id: form.catalogId, ...rates }, {
        onSuccess: () => { notifySuccess("Modelo habilitado para esta empresa"); setOpen(false); },
      });
    }
  };

  const columns: ColumnDef<EquipmentModel>[] = [
    { id: "manufacturer", header: "Fabricante", accessorKey: "manufacturer", cell: ({ row }) => <span className="font-medium">{row.original.manufacturer}</span> },
    { id: "model", header: "Modelo", accessorKey: "model", cell: ({ row }) => row.original.local_alias || row.original.model },
    { id: "capacity", header: "Capacidad", accessorKey: "default_capacity_kg", cell: ({ row }) => row.original.default_capacity_kg ? `${row.original.default_capacity_kg} kg` : "—" },
    { id: "fuel", header: "Combustible", accessorKey: "default_fuel_type", cell: ({ row }) => FUEL_TYPE_LABELS[row.original.default_fuel_type] || row.original.default_fuel_type },
    { id: "daily", header: "Tarifa diaria", accessorKey: "default_daily_rate", meta: { kind: "money" } },
    {
      id: "actions", header: "", enableSorting: false,
      cell: ({ row }) => <EquipmentModelRowActions model={row.original} unitsInUse={countUnits(row.original)} onEdit={() => openEdit(row.original)} onDeactivate={() => deactivate.mutate(row.original.id, { onSuccess: () => notifySuccess("Modelo desactivado para esta empresa") })} />,
    },
  ];
  const table = useLiftgoTable<EquipmentModel>({ data: models, columns, getRowId: (model) => model.id, initialSorting: [{ id: "manufacturer", desc: false }], paginated: false });
  const pending = activate.isPending || update.isPending;

  if (local.isError || catalog.isError) {
    return <QueryErrorState bare entity="los modelos de equipo" onRetry={() => { void local.refetch(); void catalog.refetch(); }} />;
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">La ficha técnica es global; el alias y las tarifas pertenecen a esta empresa.</p>
        <Button onClick={openNew} size="sm"><AddIcon className="mr-2 h-4 w-4" />Habilitar modelo</Button>
      </div>
      {local.isLoading || catalog.isLoading ? (
        <Card><CardContent className="py-14 text-center text-sm text-muted-foreground">Cargando…</CardContent></Card>
      ) : isMobile ? (
        <MobileCardList items={models} keyExtractor={(model) => model.id} emptyMessage="No hay modelos de equipo configurados" renderCard={(model) => (
          <Card><CardContent className="space-y-1 p-3">
            <div className="flex items-center justify-between gap-2">
              <span className="font-medium">{model.manufacturer} {model.local_alias || model.model}</span>
              <EquipmentModelRowActions model={model} unitsInUse={countUnits(model)} onEdit={() => openEdit(model)} onDeactivate={() => deactivate.mutate(model.id)} />
            </div>
            <div className="text-xs text-muted-foreground">{model.default_capacity_kg ? `${model.default_capacity_kg} kg · ` : ""}{FUEL_TYPE_LABELS[model.default_fuel_type] || model.default_fuel_type}</div>
          </CardContent></Card>
        )} />
      ) : <DataTableV2 table={table} isLoading={local.isLoading} emptyMessage="No hay modelos de equipo configurados" />}

      <FormDialog open={open} onOpenChange={setOpen} isPending={pending} title={editId ? "Configuración local del modelo" : "Habilitar modelo global"} description="Las tarifas y el alias sólo aplican a esta organización.">
        <div className="grid gap-4 py-2">
          {!editId && <div className="space-y-1.5"><Label>Modelo LiftGo *</Label><Select value={form.catalogId} onValueChange={(value) => set("catalogId", value)}><SelectTrigger><SelectValue placeholder="Selecciona un modelo" /></SelectTrigger><SelectContent>{(catalog.data ?? []).map((item) => <SelectItem key={item.id} value={item.id}>{item.manufacturer} {item.model}</SelectItem>)}</SelectContent></Select></div>}
          {editId && <div className="rounded-md border bg-muted/40 p-3 text-sm"><span className="font-medium">{models.find((model) => model.id === editId)?.manufacturer} {models.find((model) => model.id === editId)?.model}</span><p className="text-muted-foreground">La ficha técnica se administra en el Catálogo LiftGo.</p></div>}
          <div className="space-y-1.5"><Label>Alias interno</Label><Input value={form.alias} onChange={(event) => set("alias", event.target.value)} placeholder="Opcional" /></div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <RateField label="Tarifa diaria" value={form.daily} onChange={(value) => set("daily", value)} />
            <RateField label="Tarifa semanal" value={form.weekly} onChange={(value) => set("weekly", value)} />
            <RateField label="Tarifa mensual" value={form.monthly} onChange={(value) => set("monthly", value)} />
          </div>
        </div>
        <FormDialogFooter><FormDialogCancelButton onCancel={() => setOpen(false)} disabled={pending} /><Button onClick={submit} disabled={pending}>{editId ? "Guardar" : "Habilitar"}</Button></FormDialogFooter>
      </FormDialog>
    </div>
  );
}

function RateField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <div className="space-y-1.5"><Label>{label}</Label><Input type="number" min="0" value={value} onChange={(event) => onChange(event.target.value)} /></div>;
}

function EquipmentModelRowActions({ model, unitsInUse, onEdit, onDeactivate }: { model: EquipmentModel; unitsInUse: number; onEdit: () => void; onDeactivate: () => void }) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const usage = unitsInUse > 0 ? `Hay ${unitsInUse} unidad${unitsInUse === 1 ? "" : "es"} activa${unitsInUse === 1 ? "" : "s"} con este modelo. Las unidades existentes conservarán su ficha.` : "Ninguna unidad activa usa este modelo.";
  return <div className="flex gap-1"><Button variant="ghost" size="icon" aria-label="Editar tarifas y alias" onClick={onEdit}><EditIcon className="h-4 w-4" /></Button><Button variant="ghost" size="icon" aria-label="Desactivar modelo" onClick={() => setConfirmOpen(true)}><DeleteIcon className="h-4 w-4 text-destructive" /></Button><ConfirmDialog open={confirmOpen} onOpenChange={setConfirmOpen} title={`¿Desactivar ${model.manufacturer} ${model.model}?`} description={usage} confirmLabel="Desactivar" destructive onConfirm={onDeactivate} /></div>;
}
