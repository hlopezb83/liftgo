import { useMemo, useState } from "react";
import { DataTableV2, useLiftgoTable, type ColumnDef } from "@/components/dataTable/v2";
import { QueryErrorState } from "@/components/feedback/QueryErrorState";
import { AddIcon, EditIcon, DeleteIcon } from "@/components/icons";
import { MobileCardList } from "@/components/layout/MobileCardList";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Switch } from "@/components/ui/switch";
import { computeFleetAvailability, useServerTodayMty } from "@/features/availability";
import { useBookings } from "@/features/bookings";
import { useForklifts } from "@/features/fleet";
import {
  useMaintenancePolicies,
  useCreateMaintenancePolicy,
  useUpdateMaintenancePolicy,
  useDeleteMaintenancePolicy,
  MaintenancePolicy,
} from "@/features/maintenance";
import { useIsMobile } from "@/hooks/use-mobile";
import { formatCurrency } from "@/lib/format/formatCurrency";
import { notifyValidation } from "@/lib/ui/appFeedback";
import { MaintenancePolicyForm } from "./MaintenancePolicyForm";
import { EMPTY_POLICY_FORM, type MaintenancePolicyFormValues } from "./maintenancePolicyFormTypes";


export function MaintenancePoliciesTab() {
  const isMobile = useIsMobile();
  const { data: policies, isLoading, isError, refetch } = useMaintenancePolicies();
  const { data: forklifts } = useForklifts();
  // R6-FE-07: el status crudo se desincroniza; "rentado" = reserva confirmed
  // que cubre hoy (misma definición que FleetPage / Panel / Calendario).
  const { data: fleetBookings } = useBookings();
  const todayYmd = useServerTodayMty();
  const create = useCreateMaintenancePolicy();
  const update = useUpdateMaintenancePolicy();
  const del = useDeleteMaintenancePolicy();
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<MaintenancePolicyFormValues>(EMPTY_POLICY_FORM);
  const set = (key: keyof MaintenancePolicyFormValues, value: string) =>
    setForm((p) => ({ ...p, [key]: value }));

  // R7-FE-01: sin reservas cargadas no remapeamos (fallback al status crudo)
  // para no ocultar unidades rentadas mientras llega la query de bookings.
  const rentedIds = useMemo(
    () =>
      fleetBookings
        ? computeFleetAvailability(forklifts, fleetBookings, todayYmd)?.rentedForkliftIds
        : undefined,
    [forklifts, fleetBookings, todayYmd],
  );
  const rentedForklifts = forklifts?.filter((f) => {
    if (editId && policies?.find((p) => p.id === editId)?.forklift_id === f.id) return true;
    // maintenance/retired/sold mandan sobre la reserva (regla del helper).
    if (f.status !== "available" && f.status !== "rented") return false;
    return rentedIds ? rentedIds.has(f.id) : f.status === "rented";
  });
  const existingForkliftIds = policies?.map((p) => p.forklift_id) ?? [];
  const availableForSelect = rentedForklifts?.filter(
    (f) => !existingForkliftIds.includes(f.id) || (editId && policies?.find((p) => p.id === editId)?.forklift_id === f.id)
  );

  // E4: snapshot de los valores al abrir el modal para poder avisar antes de
  // descartar cambios (el formulario es state plano, sin react-hook-form).
  const [baseline, setBaseline] = useState<MaintenancePolicyFormValues>(EMPTY_POLICY_FORM);
  const isDirty = JSON.stringify(form) !== JSON.stringify(baseline);

  const openNew = () => { setEditId(null); setForm(EMPTY_POLICY_FORM); setBaseline(EMPTY_POLICY_FORM); setOpen(true); };
  const openEdit = (p: MaintenancePolicy) => {
    setEditId(p.id);
    const values: MaintenancePolicyFormValues = {
      forklift_id: p.forklift_id,
      provider_name: p.provider_name,
      monthly_cost: String(p.monthly_cost),
      service_type: p.service_type,
      description: p.description ?? "",
    };
    setForm(values);
    setBaseline(values);
    setOpen(true);
  };

  const handleSave = () => {
    if (!form.forklift_id || !form.provider_name) {
      notifyValidation({ message: "Montacargas y proveedor son requeridos" });
      return;
    }
    const payload = {
      forklift_id: form.forklift_id,
      provider_name: form.provider_name,
      monthly_cost: parseFloat(form.monthly_cost) || 0,
      service_type: form.service_type || "Póliza de Mantenimiento",
      description: form.description || undefined,
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

  const columns: ColumnDef<MaintenancePolicy>[] = [
    { id: "forklift_name", header: "Montacargas", accessorKey: "forklift_name", cell: ({ row }) => <span className="font-medium">{row.original.forklift_name}</span> },
    { id: "provider_name", header: "Proveedor", accessorKey: "provider_name", cell: ({ row }) => row.original.provider_name },
    { id: "service_type", header: "Tipo de Servicio", accessorKey: "service_type", cell: ({ row }) => row.original.service_type },
    { id: "monthly_cost", header: "Costo Mensual", accessorKey: "monthly_cost", meta: { kind: "money" }, cell: ({ row }) => formatCurrency(row.original.monthly_cost) },
    { id: "is_active", header: "Estado", enableSorting: false, cell: ({ row }) => <Switch checked={row.original.is_active} onCheckedChange={() => toggleActive(row.original)} /> },
    { id: "last_generated_month", header: "Último Mes Generado", accessorKey: "last_generated_month", cell: ({ row }) => <span className="text-sm text-muted-foreground">{row.original.last_generated_month ?? "—"}</span> },
    {
      id: "actions",
      header: "",
      enableSorting: false,
      cell: ({ row }) => (
        <MaintenancePolicyRowActions
          policy={row.original}
          onEdit={() => openEdit(row.original)}
          onDelete={() => del.mutate(row.original.id)}
        />
      ),
    },
  ];


  const table = useLiftgoTable<MaintenancePolicy>({
    data: policies,
    columns,
    getRowId: (p) => p.id,
    initialSorting: [{ id: "forklift_name", desc: false }],
    paginated: false,
  });

  return (
    <div className="space-y-4 mt-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Configura pólizas de mantenimiento con proveedores externos. Se generará un registro automático cada mes para cada montacargas rentado con póliza activa.
        </p>
        <Button size="sm" onClick={openNew}><AddIcon className="h-4 w-4 mr-1" />Nueva Póliza</Button>
      </div>

      {isError ? (
        <QueryErrorState bare entity="las pólizas de mantenimiento" onRetry={() => { void refetch(); }} />
      ) : isLoading ? (
        <Card><CardContent className="py-14 text-center text-sm text-muted-foreground">Cargando…</CardContent></Card>
      ) : isMobile ? (
        <MobileCardList
          items={policies ?? []}
          keyExtractor={(p) => p.id}
          emptyMessage="No hay pólizas de mantenimiento configuradas"
          renderCard={(p) => (
            <PolicyMobileCard
              policy={p}
              onToggle={() => toggleActive(p)}
              onEdit={() => openEdit(p)}
              onDelete={() => del.mutate(p.id)}
            />
          )}
        />
      ) : (
        <div className="border rounded-lg">
          <DataTableV2 table={table} isLoading={isLoading} emptyMessage="No hay pólizas de mantenimiento configuradas" />
        </div>
      )}

      <MaintenancePolicyForm
        open={open}
        onOpenChange={setOpen}
        isEdit={!!editId}
        isPending={create.isPending || update.isPending}
        isDirty={isDirty}
        form={form}
        availableForklifts={availableForSelect}
        onChange={set}
        onSave={handleSave}
      />
    </div>
  );
}

function PolicyMobileCard({ policy, onToggle, onEdit, onDelete }: { policy: MaintenancePolicy; onToggle: () => void; onEdit: () => void; onDelete: () => void }) {
  return (
    <Card>
      <CardContent className="p-3 space-y-1">
        <div className="flex items-center justify-between gap-2">
          <span className="font-medium">{policy.forklift_name}</span>
          <div className="flex items-center gap-2">
            <Switch checked={policy.is_active} onCheckedChange={onToggle} />
            <MaintenancePolicyRowActions policy={policy} onEdit={onEdit} onDelete={onDelete} />
          </div>
        </div>
        <div className="text-xs text-muted-foreground truncate">
          {policy.provider_name} · {policy.service_type}
        </div>
        <div className="text-xs text-muted-foreground">
          <span className="font-mono">{formatCurrency(policy.monthly_cost)}</span>
          {policy.last_generated_month ? ` · Último: ${policy.last_generated_month}` : ""}
        </div>
      </CardContent>
    </Card>
  );
}

function MaintenancePolicyRowActions({ policy, onEdit, onDelete }: { policy: MaintenancePolicy; onEdit: () => void; onDelete: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="flex gap-1">
      <Button variant="ghost" size="icon" aria-label="Editar póliza" title="Editar póliza" onClick={onEdit}><EditIcon className="h-4 w-4" /></Button>
      <Button variant="ghost" size="icon" aria-label="Eliminar póliza" title="Eliminar póliza" onClick={() => setOpen(true)}><DeleteIcon className="h-4 w-4 text-destructive" /></Button>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title="¿Eliminar póliza?"
        description={`Se eliminará la póliza de ${policy.forklift_name}. Los registros de mantenimiento ya generados no se afectarán.`}
        confirmLabel="Eliminar"
        destructive
        onConfirm={onDelete}
      />
    </div>
  );
}
