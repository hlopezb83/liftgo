import { useMemo, useState } from "react";
import { notifyError } from "@/lib/ui/appFeedback";
import {
  useMaintenancePolicies,
  useCreateMaintenancePolicy,
  useUpdateMaintenancePolicy,
  useDeleteMaintenancePolicy,
  MaintenancePolicy,
} from "@/features/maintenance";
import { useForklifts } from "@/features/fleet";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { DataTableV2, useLiftgoTable, type ColumnDef } from "@/components/dataTable/v2";
import { formatCurrency } from "@/lib/format/formatCurrency";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { MaintenancePolicyForm } from "./MaintenancePolicyForm";
import { EMPTY_POLICY_FORM, type MaintenancePolicyFormValues } from "./maintenancePolicyFormTypes";


export function MaintenancePoliciesTab() {
  const { data: policies, isLoading } = useMaintenancePolicies();
  const { data: forklifts } = useForklifts();
  const create = useCreateMaintenancePolicy();
  const update = useUpdateMaintenancePolicy();
  const del = useDeleteMaintenancePolicy();
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<MaintenancePolicyFormValues>(EMPTY_POLICY_FORM);
  const set = (key: keyof MaintenancePolicyFormValues, value: string) =>
    setForm((p) => ({ ...p, [key]: value }));

  const rentedForklifts = forklifts?.filter(
    (f) => f.status === "rented" || (editId && policies?.find((p) => p.id === editId)?.forklift_id === f.id)
  );
  const existingForkliftIds = policies?.map((p) => p.forklift_id) ?? [];
  const availableForSelect = rentedForklifts?.filter(
    (f) => !existingForkliftIds.includes(f.id) || (editId && policies?.find((p) => p.id === editId)?.forklift_id === f.id)
  );

  const openNew = () => { setEditId(null); setForm(EMPTY_POLICY_FORM); setOpen(true); };
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
      notifyError({ message: "Montacargas y proveedor son requeridos" });
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

  const columns = useMemo<ColumnDef<MaintenancePolicy>[]>(
    () => [
      { id: "forklift_name", header: "Montacargas", accessorKey: "forklift_name", cell: ({ row }) => <span className="font-medium">{row.original.forklift_name}</span> },
      { id: "provider_name", header: "Proveedor", accessorKey: "provider_name", cell: ({ row }) => row.original.provider_name },
      { id: "service_type", header: "Tipo de Servicio", accessorKey: "service_type", cell: ({ row }) => row.original.service_type },
      { id: "monthly_cost", header: "Costo Mensual", accessorKey: "monthly_cost", meta: { align: "right" }, cell: ({ row }) => <span className="font-mono">{formatCurrency(row.original.monthly_cost)}</span> },
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
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

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
        <Button size="sm" onClick={openNew}><Plus className="h-4 w-4 mr-1" />Nueva Póliza</Button>
      </div>

      <div className="border rounded-lg">
        <DataTableV2 table={table} isLoading={isLoading} emptyMessage="No hay pólizas de mantenimiento configuradas" />
      </div>

      <MaintenancePolicyForm
        open={open}
        onOpenChange={setOpen}
        isEdit={!!editId}
        isPending={create.isPending || update.isPending}
        form={form}
        availableForklifts={availableForSelect}
        onChange={set}
        onSave={handleSave}
      />
    </div>
  );
}

function MaintenancePolicyRowActions({ policy, onEdit, onDelete }: { policy: MaintenancePolicy; onEdit: () => void; onDelete: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="flex gap-1">
      <Button variant="ghost" size="icon" onClick={onEdit}><Pencil className="h-4 w-4" /></Button>
      <Button variant="ghost" size="icon" onClick={() => setOpen(true)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
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
