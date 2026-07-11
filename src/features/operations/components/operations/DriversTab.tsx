import { useState } from "react";
import { notifyError, notifySuccess, notifyValidation } from "@/lib/ui/appFeedback";
import { useDrivers, useCreateDriver, useUpdateDriver, useDeleteDriver, Driver } from "@/features/fleet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { FormDialog, FormDialogFooter } from "@/components/forms/FormDialog";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { StatusBadge } from "@/components/feedback/StatusBadge";
import { DataTableV2, useLiftgoTable, type ColumnDef } from "@/components/dataTable/v2";
import { AddIcon, EditIcon, DeleteIcon } from "@/components/icons";

export function DriversTab() {
  const { data: drivers, isLoading } = useDrivers();
  const create = useCreateDriver();
  const update = useUpdateDriver();
  const del = useDeleteDriver();
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const emptyForm = { name: "", phone: "", email: "", license_number: "", is_active: true, notes: "" };
  const [form, setForm] = useState(emptyForm);
  const set = (key: string, value: string | boolean) => setForm((p) => ({ ...p, [key]: value }));

  const openNew = () => { setEditId(null); setForm(emptyForm); setOpen(true); };
  const openEdit = (d: Driver) => {
    setEditId(d.id);
    setForm({ name: d.name, phone: d.phone ?? "", email: d.email ?? "", license_number: d.license_number ?? "", is_active: d.is_active, notes: d.notes ?? "" });
    setOpen(true);
  };

  const handleSubmit = () => {
    if (!form.name) { notifyValidation({ message: "El nombre es requerido" }); return; }
    const payload = { name: form.name, phone: form.phone || null, email: form.email || null, license_number: form.license_number || null, is_active: form.is_active, notes: form.notes || null };
    const onError = (err: Error) => {
      if (err.message?.includes("drivers_name_unique")) notifyError({ error: err, message: "Ya existe un operador con este nombre", severity: "warning" });
      else notifyError({ error: err, message: "Error al guardar operador" });
    };
    if (editId) {
      update.mutate({ id: editId, ...payload }, { onSuccess: () => { notifySuccess("Actualizado"); setOpen(false); }, onError });
    } else {
      create.mutate(payload, { onSuccess: () => { notifySuccess("Agregado"); setOpen(false); }, onError });
    }
  };

  // Columns se recrean por render — con React Compiler activo el array se
  // memoiza automáticamente cuando los callbacks (openEdit, del.mutate) mantienen
  // identidad estable. Antes había un useMemo(..., []) con `eslint-disable`
  // porque las cells cerraban sobre state; el disable bloqueaba al compilador.
  const columns: ColumnDef<Driver>[] = [
    { id: "name", header: "Nombre", accessorKey: "name", cell: ({ row }) => <span className="font-medium">{row.original.name}</span> },
    { id: "phone", header: "Teléfono", accessorKey: "phone", enableSorting: false, cell: ({ row }) => row.original.phone || "—" },
    { id: "email", header: "Correo", accessorKey: "email", enableSorting: false, cell: ({ row }) => row.original.email || "—" },
    { id: "license_number", header: "Licencia", accessorKey: "license_number", cell: ({ row }) => row.original.license_number || "—" },
    { id: "is_active", header: "Estado", accessorKey: "is_active", cell: ({ row }) => <StatusBadge status={row.original.is_active ? "active" : "inactive"} /> },
    {
      id: "actions",
      header: "",
      enableSorting: false,
      cell: ({ row }) => (
        <DriverRowActions
          driver={row.original}
          onEdit={() => openEdit(row.original)}
          onDelete={() => del.mutate(row.original.id, { onSuccess: () => notifySuccess("Eliminado") })}
        />
      ),
    },
  ];


  const table = useLiftgoTable<Driver>({
    data: drivers,
    columns,
    getRowId: (d) => d.id,
    initialSorting: [{ id: "name", desc: false }],
    paginated: false,
  });

  return (
    <div>
      <div className="flex justify-end mb-4">
        <Button onClick={openNew} size="sm"><AddIcon className="h-4 w-4 mr-2" />Agregar Operador</Button>
      </div>
      <DataTableV2 table={table} isLoading={isLoading} emptyMessage="No hay operadores registrados" />
      <FormDialog open={open} onOpenChange={setOpen} title={`${editId ? "Editar" : "Nuevo"} Operador`} description="Administrar datos del operador para programación de entregas.">
          <div className="grid gap-4 py-2">
            <div className="space-y-1.5"><Label>Nombre *</Label><Input placeholder="Nombre completo" value={form.name} onChange={(e) => set("name", e.target.value)} /></div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5"><Label>Teléfono</Label><Input placeholder="+52 55 1234 5678" value={form.phone} onChange={(e) => set("phone", e.target.value)} /></div>
              <div className="space-y-1.5"><Label>Correo</Label><Input type="email" placeholder="operador@correo.com" value={form.email} onChange={(e) => set("email", e.target.value)} /></div>
            </div>
            <div className="space-y-1.5"><Label>Número de Licencia</Label><Input placeholder="LIC-12345" value={form.license_number} onChange={(e) => set("license_number", e.target.value)} /></div>
            <div className="flex items-center gap-2">
              <Switch checked={form.is_active} onCheckedChange={(v) => set("is_active", v)} />
              <Label>Activo</Label>
            </div>
            <div className="space-y-1.5"><Label>Notas</Label><Input placeholder="Notas opcionales" value={form.notes} onChange={(e) => set("notes", e.target.value)} /></div>
          </div>
          <FormDialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={handleSubmit} disabled={create.isPending || update.isPending}>{editId ? "Guardar" : "Agregar"}</Button>
          </FormDialogFooter>
        </FormDialog>
    </div>
  );
}

function DriverRowActions({ driver, onEdit, onDelete }: { driver: Driver; onEdit: () => void; onDelete: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="flex gap-1">
      <Button variant="ghost" size="icon" onClick={onEdit}><EditIcon className="h-4 w-4" /></Button>
      <Button variant="ghost" size="icon" onClick={() => setOpen(true)}><DeleteIcon className="h-4 w-4 text-destructive" /></Button>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title={`¿Eliminar ${driver.name}?`}
        description="Esta acción no se puede deshacer."
        confirmLabel="Eliminar"
        destructive
        onConfirm={onDelete}
      />
    </div>
  );
}
