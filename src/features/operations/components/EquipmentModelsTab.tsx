import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  type Forklift,
} from "@/features/fleet";
import { useHasModuleAccess } from "@/features/users";
import { useIsMobile } from "@/hooks/use-mobile";
import { RoleGuard } from "@/layouts/RoleGuard";
import { FUEL_TYPE_LABELS } from "@/lib/constants";
import { formatCurrency } from "@/lib/format/formatCurrency";
import { notifySuccess, notifyValidation } from "@/lib/ui/appFeedback";
import { countUnitsForModel, validateNonNegative } from "../lib/equipmentModelValidation";

type FormState = {
  catalogId: string;
  alias: string;
  daily: string;
  weekly: string;
  monthly: string;
};

const EMPTY: FormState = { catalogId: "", alias: "", daily: "", weekly: "", monthly: "" };
const EMPTY_MODELS: EquipmentModel[] = [];
const EMPTY_FORKLIFTS: Forklift[] = [];

function validateEquipmentModelForm(editId: string | null, form: FormState): string | null {
  if (!editId && !form.catalogId) return "Selecciona un modelo del catálogo LiftGo";
  for (const [value, label] of [[form.daily, "Tarifa diaria"], [form.weekly, "Tarifa semanal"], [form.monthly, "Tarifa mensual"]] as const) {
    const error = validateNonNegative(value, label);
    if (error) return error;
  }
  return null;
}

function buildRatesPayload(form: FormState) {
  return {
    local_alias: form.alias.trim() || null,
    default_daily_rate: form.daily ? Number(form.daily) : 0,
    default_weekly_rate: form.weekly ? Number(form.weekly) : 0,
    default_monthly_rate: form.monthly ? Number(form.monthly) : 0,
  };
}

export function EquipmentModelsTab() {
  const canWrite = useHasModuleAccess("Configuración", "full");
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

  const models = local.data ?? EMPTY_MODELS;
  const forkliftList = forklifts ?? EMPTY_FORKLIFTS;

  const deactivateMutateRef = useRef(deactivate.mutate);
  useEffect(() => {
    deactivateMutateRef.current = deactivate.mutate;
  });

  const deactivateModel = useCallback((id: string) => {
    if (!canWrite) return;
    deactivateMutateRef.current(id, { onSuccess: () => notifySuccess("Modelo desactivado para esta empresa") });
  }, [canWrite]);

  const openNew = () => { if (!canWrite) return; setEditId(null); setForm(EMPTY); setOpen(true); };
  const openEdit = useCallback((model: EquipmentModel) => {
    if (!canWrite) return;
    setEditId(model.id);
    setForm({
      catalogId: model.catalog_model_id ?? "",
      alias: model.local_alias ?? "",
      daily: model.default_daily_rate?.toString() ?? "",
      weekly: model.default_weekly_rate?.toString() ?? "",
      monthly: model.default_monthly_rate?.toString() ?? "",
    });
    setOpen(true);
  }, [canWrite]);

  const submit = () => {
    if (!canWrite || activate.isPending || update.isPending) return;
    const validationError = validateEquipmentModelForm(editId, form);
    if (validationError) { notifyValidation({ message: validationError }); return; }
    const rates = buildRatesPayload(form);
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

  const columns = useMemo<ColumnDef<EquipmentModel>[]>(() => [
    { id: "manufacturer", header: "Fabricante", accessorKey: "manufacturer", cell: ({ row }) => <span className="font-medium">{row.original.manufacturer}</span> },
    { id: "model", header: "Modelo", accessorKey: "model", cell: ({ row }) => row.original.local_alias || row.original.model },
    { id: "capacity", header: "Capacidad", accessorKey: "default_capacity_kg", cell: ({ row }) => row.original.default_capacity_kg ? `${row.original.default_capacity_kg} kg` : "—" },
    { id: "fuel", header: "Combustible", accessorKey: "default_fuel_type", cell: ({ row }) => FUEL_TYPE_LABELS[row.original.default_fuel_type] || row.original.default_fuel_type },
    { id: "daily", header: "Tarifa diaria", accessorKey: "default_daily_rate", meta: { kind: "money" }, cell: ({ row }) => formatCurrency(row.original.default_daily_rate) },
    {
      id: "actions", header: "", enableSorting: false,
      cell: ({ row }) => <EquipmentModelRowActions model={row.original} unitsInUse={countUnitsForModel(forkliftList, row.original.manufacturer, row.original.model)} onEdit={() => openEdit(row.original)} onDeactivate={() => deactivateModel(row.original.id)} />,
    },
  ], [forkliftList, openEdit, deactivateModel]);
  const countUnits = (model: EquipmentModel) =>
    countUnitsForModel(forkliftList, model.manufacturer, model.model);
  const table = useLiftgoTable<EquipmentModel>({ data: models, columns, getRowId: (model) => model.id, initialSorting: [{ id: "manufacturer", desc: false }], paginated: false });
  const pending = activate.isPending || update.isPending;

  if (local.isError || catalog.isError) {
    return <QueryErrorState error={local.error} bare entity="los modelos de equipo" onRetry={() => { void local.refetch(); void catalog.refetch(); }} />;
  }

  return (
    <div>
      <div className="mb-4 flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">La ficha técnica es global; el alias y las tarifas pertenecen a esta empresa.</p>
        <RoleGuard module="Configuración" minAccess="full" fallback={null}><Button onClick={openNew} size="sm"><AddIcon className="mr-2 h-4 w-4" />Habilitar modelo</Button></RoleGuard>
      </div>
      {local.isLoading || catalog.isLoading ? (
        <Card><CardContent className="py-14 text-center text-sm text-muted-foreground">Cargando…</CardContent></Card>
      ) : isMobile ? (
        <MobileCardList items={models} keyExtractor={(model) => model.id} emptyMessage="No hay modelos de equipo configurados" renderCard={(model) => (
          <Card><CardContent className="space-y-1 p-3">
            <div className="flex items-center justify-between gap-2">
              <span className="font-medium">{model.manufacturer} {model.local_alias || model.model}</span>
              <EquipmentModelRowActions model={model} unitsInUse={countUnits(model)} onEdit={() => openEdit(model)} onDeactivate={() => deactivateModel(model.id)} />
            </div>
            <div className="text-xs text-muted-foreground">{model.default_capacity_kg ? `${model.default_capacity_kg} kg · ` : ""}{FUEL_TYPE_LABELS[model.default_fuel_type] || model.default_fuel_type}</div>
            <div className="flex items-baseline justify-between gap-2 pt-2 text-sm">
              <span className="text-muted-foreground">Tarifa diaria</span>
              <span className="font-medium tabular-nums">{formatCurrency(model.default_daily_rate)}</span>
            </div>
          </CardContent></Card>
        )} />
      ) : <DataTableV2 table={table} isLoading={local.isLoading} emptyMessage="No hay modelos de equipo configurados" />}

      <RoleGuard module="Configuración" minAccess="full" fallback={null}>
        <EquipmentModelDialog
          open={open}
          onOpenChange={setOpen}
          pending={pending}
          editId={editId}
          models={models}
          catalogItems={catalog.data ?? []}
          form={form}
          onChange={set}
          onSubmit={submit}
        />
      </RoleGuard>
    </div>
  );
}

function EquipmentModelDialog({
  open,
  onOpenChange,
  pending,
  editId,
  models,
  catalogItems,
  form,
  onChange,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pending: boolean;
  editId: string | null;
  models: EquipmentModel[];
  catalogItems: Array<{ id: string; manufacturer: string; model: string }>;
  form: FormState;
  onChange: (key: keyof FormState, value: string) => void;
  onSubmit: () => void;
}) {
  const editedModel = editId ? models.find((model) => model.id === editId) : undefined;
  return (
    <FormDialog open={open} onOpenChange={onOpenChange} isPending={pending} title={editId ? "Configuración local del modelo" : "Habilitar modelo compartido"} description="Las tarifas y el alias sólo aplican a esta empresa.">
      <div className="grid gap-4 py-2">
        {!editId && <div className="space-y-1.5"><Label>Modelo LiftGo *</Label><Select value={form.catalogId} onValueChange={(value) => onChange("catalogId", value)}><SelectTrigger><SelectValue placeholder="Selecciona un modelo" /></SelectTrigger><SelectContent>{catalogItems.map((item) => <SelectItem key={item.id} value={item.id}>{item.manufacturer} {item.model}</SelectItem>)}</SelectContent></Select></div>}
        {editId && <div className="rounded-md border bg-muted/40 p-3 text-sm"><span className="font-medium">{editedModel?.manufacturer} {editedModel?.model}</span><p className="text-muted-foreground">La ficha técnica se administra en el Catálogo LiftGo.</p></div>}
        <div className="space-y-1.5"><Label>Alias interno</Label><Input value={form.alias} onChange={(event) => onChange("alias", event.target.value)} placeholder="Opcional" /></div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <RateField label="Tarifa diaria" value={form.daily} onChange={(value) => onChange("daily", value)} />
          <RateField label="Tarifa semanal" value={form.weekly} onChange={(value) => onChange("weekly", value)} />
          <RateField label="Tarifa mensual" value={form.monthly} onChange={(value) => onChange("monthly", value)} />
        </div>
      </div>
      <FormDialogFooter><FormDialogCancelButton onCancel={() => onOpenChange(false)} disabled={pending} /><Button onClick={onSubmit} disabled={pending}>{editId ? "Guardar" : "Habilitar"}</Button></FormDialogFooter>
    </FormDialog>
  );
}

function RateField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <div className="space-y-1.5"><Label>{label}</Label><Input type="number" min="0" value={value} onChange={(event) => onChange(event.target.value)} /></div>;
}

function EquipmentModelRowActions({ model, unitsInUse, onEdit, onDeactivate }: { model: EquipmentModel; unitsInUse: number; onEdit: () => void; onDeactivate: () => void }) {
  const canWrite = useHasModuleAccess("Configuración", "full");
  const [confirmOpen, setConfirmOpen] = useState(false);
  if (!canWrite) return null;
  const usage = unitsInUse > 0 ? `Hay ${unitsInUse} unidad${unitsInUse === 1 ? "" : "es"} activa${unitsInUse === 1 ? "" : "s"} con este modelo. Las unidades existentes conservarán su ficha.` : "Ninguna unidad activa usa este modelo.";
  return <div className="flex gap-1"><Button variant="ghost" size="icon" aria-label="Editar tarifas y alias" onClick={onEdit}><EditIcon className="h-4 w-4" /></Button><Button variant="ghost" size="icon" aria-label="Desactivar modelo" onClick={() => setConfirmOpen(true)}><DeleteIcon className="h-4 w-4 text-destructive" /></Button><ConfirmDialog open={confirmOpen} onOpenChange={setConfirmOpen} title={`¿Desactivar ${model.manufacturer} ${model.model}?`} description={usage} confirmLabel="Desactivar" destructive onConfirm={onDeactivate} /></div>;
}
