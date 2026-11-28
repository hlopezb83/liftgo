import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DataTableV2, useLiftgoTable, type ColumnDef } from "@/components/dataTable/v2";
import { QueryErrorState } from "@/components/feedback/QueryErrorState";
import { StatusBadge } from "@/components/feedback/StatusBadge";
import { FormDialog, FormDialogFooter } from "@/components/forms/FormDialog";
import { FormDialogCancelButton } from "@/components/forms/FormDialogCancelButton";
import { AddIcon, EditIcon, DeleteIcon } from "@/components/icons";
import { MobileCardList } from "@/components/layout/MobileCardList";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useMechanics, useCreateMechanic, useUpdateMechanic, useDeleteMechanic, Mechanic } from "@/features/maintenance";
import { useHasModuleAccess } from "@/features/users";
import { useIsMobile } from "@/hooks/use-mobile";
import { notifyError, notifySuccess, notifyValidation } from "@/lib/ui/appFeedback";

const EMPTY_MECHANICS: Mechanic[] = [];
const EMPTY_MECHANIC_FORM = { name: "", phone: "", email: "", specialization: "", is_active: true, notes: "" };

export function MechanicsTab() {
  const canWrite = useHasModuleAccess("Configuración", "full");
  const isMobile = useIsMobile();
  const { data: mechanics, isLoading, isError, refetch } = useMechanics();
  const create = useCreateMechanic();
  const update = useUpdateMechanic();
  const del = useDeleteMechanic();
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_MECHANIC_FORM);
  const [initialForm, setInitialForm] = useState(EMPTY_MECHANIC_FORM);
  const isDirty = JSON.stringify(form) !== JSON.stringify(initialForm);
  const set = (key: string, value: string | boolean) => setForm((p) => ({ ...p, [key]: value }));

  const delMutateRef = useRef(del.mutate);
  useEffect(() => {
    delMutateRef.current = del.mutate;
  });

  const openNew = () => { if (!canWrite) return; setEditId(null); setForm(EMPTY_MECHANIC_FORM); setInitialForm(EMPTY_MECHANIC_FORM); setOpen(true); };
  const openEdit = useCallback((m: Mechanic) => {
    if (!canWrite) return;
    setEditId(m.id);
    const values = { name: m.name, phone: m.phone ?? "", email: m.email ?? "", specialization: m.specialization ?? "", is_active: m.is_active, notes: m.notes ?? "" };
    setForm(values);
    setInitialForm(values);
    setOpen(true);
  }, [canWrite]);

  const handleDelete = useCallback((id: string) => {
    if (!canWrite) return;
    delMutateRef.current(id, { onSuccess: () => notifySuccess("Mecánico eliminado") });
  }, [canWrite]);

  const handleSubmit = () => {
    if (!canWrite || create.isPending || update.isPending) return;
    if (!form.name) { notifyValidation({ message: "El nombre es requerido" }); return; }
    const payload = { name: form.name, phone: form.phone || null, email: form.email || null, specialization: form.specialization || null, is_active: form.is_active, notes: form.notes || null };
    const onError = (err: Error) => {
      if (err.message?.includes("mechanics_name_unique")) notifyError({ error: err, message: "Ya existe un mecánico con este nombre", severity: "warning" });
      else notifyError({ error: err, message: "Error al guardar mecánico" });
    };
    if (editId) {
      update.mutate({ id: editId, ...payload }, { onSuccess: () => { notifySuccess("Mecánico actualizado"); setOpen(false); }, onError });
    } else {
      create.mutate(payload, { onSuccess: () => { notifySuccess("Mecánico agregado"); setOpen(false); }, onError });
    }
  };

  const columns = useMemo<ColumnDef<Mechanic>[]>(() => [
    { id: "name", header: "Nombre", accessorKey: "name", cell: ({ row }) => <span className="font-medium">{row.original.name}</span> },
    { id: "phone", header: "Teléfono", accessorKey: "phone", enableSorting: false, cell: ({ row }) => row.original.phone || "—" },
    { id: "email", header: "Correo", accessorKey: "email", enableSorting: false, cell: ({ row }) => row.original.email || "—" },
    { id: "specialization", header: "Especialización", accessorKey: "specialization", cell: ({ row }) => row.original.specialization || "—" },
    { id: "is_active", header: "Estado", accessorKey: "is_active", cell: ({ row }) => <StatusBadge status={row.original.is_active ? "active" : "inactive"} /> },
    {
      id: "actions",
      header: "",
      enableSorting: false,
      cell: ({ row }) => (
        <MechanicRowActions
          mechanic={row.original}
          onEdit={() => openEdit(row.original)}
          onDelete={() => handleDelete(row.original.id)}
        />
      ),
    },
  ], [openEdit, handleDelete]);

  const table = useLiftgoTable<Mechanic>({
    data: mechanics ?? EMPTY_MECHANICS,
    columns,
    getRowId: (m) => m.id,
    initialSorting: [{ id: "name", desc: false }],
    paginated: false,
  });

  return (
    <div>
      <div className="flex justify-end mb-4">
        {canWrite && <Button onClick={openNew} size="sm"><AddIcon className="h-4 w-4 mr-2" />Agregar mecánico</Button>}
      </div>
      {isError ? (
        <QueryErrorState bare entity="los mecánicos" onRetry={() => { void refetch(); }} />
      ) : isLoading ? (
        <Card><CardContent className="py-14 text-center text-sm text-muted-foreground">Cargando…</CardContent></Card>
      ) : isMobile ? (
        <MobileCardList
          items={mechanics ?? []}
          keyExtractor={(m) => m.id}
          emptyMessage="No hay mecánicos registrados"
          renderCard={(m) => (
            <Card>
              <CardContent className="p-3 space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium">{m.name}</span>
                  <div className="flex items-center gap-2">
                    <StatusBadge status={m.is_active ? "active" : "inactive"} />
                    <MechanicRowActions
                      mechanic={m}
                      onEdit={() => openEdit(m)}
                      onDelete={() => canWrite && del.mutate(m.id, { onSuccess: () => notifySuccess("Mecánico eliminado") })}
                    />
                  </div>
                </div>
                <div className="text-xs text-muted-foreground truncate">
                  {m.phone || "—"} · {m.email || "—"}
                </div>
                {m.specialization ? (
                  <div className="text-xs text-muted-foreground">{m.specialization}</div>
                ) : null}
              </CardContent>
            </Card>
          )}
        />
      ) : (
        <DataTableV2 table={table} isLoading={isLoading} emptyMessage="No hay mecánicos registrados" />
      )}
      <FormDialog
      isDirty={isDirty} isPending={create.isPending || update.isPending} open={open && canWrite} onOpenChange={setOpen} title={`${editId ? "Editar" : "Nuevo"} mecánico`} description="Administrar datos del mecánico para asignación de mantenimientos.">
          <div className="grid gap-4 py-2">
            <div className="space-y-1.5"><Label>Nombre *</Label><Input placeholder="Nombre completo" value={form.name} onChange={(e) => set("name", e.target.value)} /></div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5"><Label>Teléfono</Label><Input placeholder="+52 55 1234 5678" value={form.phone} onChange={(e) => set("phone", e.target.value)} /></div>
              <div className="space-y-1.5"><Label>Correo</Label><Input type="email" placeholder="mecanico@correo.com" value={form.email} onChange={(e) => set("email", e.target.value)} /></div>
            </div>
            <div className="space-y-1.5"><Label>Especialización</Label><Input placeholder="ej. Hidráulica, Eléctrica" value={form.specialization} onChange={(e) => set("specialization", e.target.value)} /></div>
            <div className="flex items-center gap-2">
              <Switch checked={form.is_active} onCheckedChange={(v) => set("is_active", v)} />
              <Label>Activo</Label>
            </div>
            <div className="space-y-1.5"><Label>Notas</Label><Input placeholder="Notas opcionales" value={form.notes} onChange={(e) => set("notes", e.target.value)} /></div>
          </div>
          <FormDialogFooter>
            <FormDialogCancelButton onCancel={() => setOpen(false)} disabled={create.isPending || update.isPending} />
            <Button onClick={handleSubmit} disabled={create.isPending || update.isPending}>{editId ? "Guardar" : "Agregar"}</Button>
          </FormDialogFooter>
        </FormDialog>
    </div>
  );
}

function MechanicRowActions({ mechanic, onEdit, onDelete }: { mechanic: Mechanic; onEdit: () => void; onDelete: () => void }) {
  const canWrite = useHasModuleAccess("Configuración", "full");
  const [open, setOpen] = useState(false);
  if (!canWrite) return null;
  return (
    <div className="flex gap-1">
      <Button variant="ghost" size="icon" aria-label="Editar mecánico" title="Editar mecánico" onClick={onEdit}><EditIcon className="h-4 w-4" /></Button>
      <Button variant="ghost" size="icon" aria-label="Eliminar mecánico" title="Eliminar mecánico" onClick={() => setOpen(true)}><DeleteIcon className="h-4 w-4 text-destructive" /></Button>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title={`¿Eliminar ${mechanic.name}?`}
        description="Esta acción no se puede deshacer."
        confirmLabel="Eliminar"
        destructive
        onConfirm={onDelete}
      />
    </div>
  );
}
