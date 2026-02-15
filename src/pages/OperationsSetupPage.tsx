import { useState } from "react";
import { useEquipmentModels, useCreateEquipmentModel, useUpdateEquipmentModel, useDeleteEquipmentModel, EquipmentModel } from "@/hooks/useEquipmentModels";
import { useDrivers, useCreateDriver, useUpdateDriver, useDeleteDriver, Driver } from "@/hooks/useDrivers";
import { useMechanics, useCreateMechanic, useUpdateMechanic, useDeleteMechanic, Mechanic } from "@/hooks/useMechanics";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { TableSkeleton } from "@/components/TableSkeleton";
import { EmptyRow } from "@/components/EmptyRow";
import { StatusBadge } from "@/components/StatusBadge";
import { Plus, Pencil, Trash2, Truck, Wrench, Settings } from "lucide-react";
import { toast } from "sonner";

/* ── Equipment Models Tab ── */
function EquipmentModelsTab() {
  const { data: models, isLoading } = useEquipmentModels();
  const create = useCreateEquipmentModel();
  const update = useUpdateEquipmentModel();
  const del = useDeleteEquipmentModel();
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const emptyForm = { manufacturer: "", model: "", default_capacity_kg: "", default_mast_height_m: "", default_fuel_type: "Diesel" };
  const [form, setForm] = useState(emptyForm);
  const set = (key: string, value: string) => setForm((p) => ({ ...p, [key]: value }));

  const openNew = () => { setEditId(null); setForm(emptyForm); setOpen(true); };
  const openEdit = (m: EquipmentModel) => {
    setEditId(m.id);
    setForm({ manufacturer: m.manufacturer, model: m.model, default_capacity_kg: m.default_capacity_kg?.toString() ?? "", default_mast_height_m: m.default_mast_height_m?.toString() ?? "", default_fuel_type: m.default_fuel_type });
    setOpen(true);
  };

  const handleSubmit = () => {
    if (!form.manufacturer || !form.model) { toast.error("Manufacturer and model are required"); return; }
    const payload = { manufacturer: form.manufacturer, model: form.model, default_capacity_kg: form.default_capacity_kg ? parseFloat(form.default_capacity_kg) : null, default_mast_height_m: form.default_mast_height_m ? parseFloat(form.default_mast_height_m) : null, default_fuel_type: form.default_fuel_type };
    if (editId) {
      update.mutate({ id: editId, ...payload }, { onSuccess: () => { toast.success("Updated"); setOpen(false); } });
    } else {
      create.mutate(payload, { onSuccess: () => { toast.success("Added"); setOpen(false); } });
    }
  };

  return (
    <div>
      <div className="flex justify-end mb-4">
        <Button onClick={openNew} size="sm"><Plus className="h-4 w-4 mr-2" />Add Model</Button>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Manufacturer</TableHead><TableHead>Model</TableHead><TableHead>Capacity (kg)</TableHead><TableHead>Mast Height (m)</TableHead><TableHead>Fuel Type</TableHead><TableHead className="w-24" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {isLoading && <TableRow><TableCell colSpan={6}><TableSkeleton /></TableCell></TableRow>}
          {!isLoading && (!models || models.length === 0) && <EmptyRow colSpan={6} message="No equipment models configured yet" />}
          {models?.map((m) => (
            <TableRow key={m.id}>
              <TableCell className="font-medium">{m.manufacturer}</TableCell>
              <TableCell>{m.model}</TableCell>
              <TableCell>{m.default_capacity_kg ?? "—"}</TableCell>
              <TableCell>{m.default_mast_height_m ?? "—"}</TableCell>
              <TableCell>{m.default_fuel_type}</TableCell>
              <TableCell>
                <div className="flex gap-1">
                  <Button variant="ghost" size="icon" onClick={() => openEdit(m)}><Pencil className="h-4 w-4" /></Button>
                  <AlertDialog>
                    <AlertDialogTrigger asChild><Button variant="ghost" size="icon"><Trash2 className="h-4 w-4 text-destructive" /></Button></AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader><AlertDialogTitle>Delete {m.manufacturer} {m.model}?</AlertDialogTitle><AlertDialogDescription>This won't affect existing forklifts.</AlertDialogDescription></AlertDialogHeader>
                      <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={() => del.mutate(m.id, { onSuccess: () => toast.success("Deleted") })}>Delete</AlertDialogAction></AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editId ? "Edit" : "Add"} Equipment Model</DialogTitle><DialogDescription>Define a manufacturer/model combination with default specs.</DialogDescription></DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="space-y-1.5"><Label>Manufacturer *</Label><Input placeholder="e.g. Hyster" value={form.manufacturer} onChange={(e) => set("manufacturer", e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Model *</Label><Input placeholder="e.g. H50" value={form.model} onChange={(e) => set("model", e.target.value)} /></div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5"><Label>Default Capacity (kg)</Label><Input type="number" placeholder="2500" value={form.default_capacity_kg} onChange={(e) => set("default_capacity_kg", e.target.value)} /></div>
              <div className="space-y-1.5"><Label>Default Mast Height (m)</Label><Input type="number" placeholder="4.5" value={form.default_mast_height_m} onChange={(e) => set("default_mast_height_m", e.target.value)} /></div>
            </div>
            <div className="space-y-1.5">
              <Label>Default Fuel Type</Label>
              <Select value={form.default_fuel_type} onValueChange={(v) => set("default_fuel_type", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{["Diesel", "Electric", "LPG", "Gasoline"].map((f) => <SelectItem key={f} value={f}>{f}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={handleSubmit} disabled={create.isPending || update.isPending}>{editId ? "Save" : "Add"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ── Drivers Tab ── */
function DriversTab() {
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
    if (!form.name) { toast.error("Name is required"); return; }
    const payload = { name: form.name, phone: form.phone || null, email: form.email || null, license_number: form.license_number || null, is_active: form.is_active, notes: form.notes || null };
    const onError = (err: Error) => {
      if (err.message?.includes("drivers_name_unique")) toast.error("A driver with this name already exists");
      else toast.error("Failed to save driver");
    };
    if (editId) {
      update.mutate({ id: editId, ...payload }, { onSuccess: () => { toast.success("Updated"); setOpen(false); }, onError });
    } else {
      create.mutate(payload, { onSuccess: () => { toast.success("Added"); setOpen(false); }, onError });
    }
  };

  return (
    <div>
      <div className="flex justify-end mb-4">
        <Button onClick={openNew} size="sm"><Plus className="h-4 w-4 mr-2" />Add Driver</Button>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead><TableHead>Phone</TableHead><TableHead>Email</TableHead><TableHead>License</TableHead><TableHead>Status</TableHead><TableHead className="w-24" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {isLoading && <TableRow><TableCell colSpan={6}><TableSkeleton /></TableCell></TableRow>}
          {!isLoading && (!drivers || drivers.length === 0) && <EmptyRow colSpan={6} message="No drivers added yet" />}
          {drivers?.map((d) => (
            <TableRow key={d.id}>
              <TableCell className="font-medium">{d.name}</TableCell>
              <TableCell>{d.phone || "—"}</TableCell>
              <TableCell>{d.email || "—"}</TableCell>
              <TableCell>{d.license_number || "—"}</TableCell>
              <TableCell><StatusBadge status={d.is_active ? "active" : "inactive"} /></TableCell>
              <TableCell>
                <div className="flex gap-1">
                  <Button variant="ghost" size="icon" onClick={() => openEdit(d)}><Pencil className="h-4 w-4" /></Button>
                  <AlertDialog>
                    <AlertDialogTrigger asChild><Button variant="ghost" size="icon"><Trash2 className="h-4 w-4 text-destructive" /></Button></AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader><AlertDialogTitle>Delete {d.name}?</AlertDialogTitle><AlertDialogDescription>This action cannot be undone.</AlertDialogDescription></AlertDialogHeader>
                      <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={() => del.mutate(d.id, { onSuccess: () => toast.success("Deleted") })}>Delete</AlertDialogAction></AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editId ? "Edit" : "Add"} Driver</DialogTitle><DialogDescription>Manage driver details for delivery scheduling.</DialogDescription></DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="space-y-1.5"><Label>Name *</Label><Input placeholder="Full name" value={form.name} onChange={(e) => set("name", e.target.value)} /></div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5"><Label>Phone</Label><Input placeholder="+1 555 0123" value={form.phone} onChange={(e) => set("phone", e.target.value)} /></div>
              <div className="space-y-1.5"><Label>Email</Label><Input type="email" placeholder="driver@email.com" value={form.email} onChange={(e) => set("email", e.target.value)} /></div>
            </div>
            <div className="space-y-1.5"><Label>License Number</Label><Input placeholder="DL-12345" value={form.license_number} onChange={(e) => set("license_number", e.target.value)} /></div>
            <div className="flex items-center gap-2">
              <Switch checked={form.is_active} onCheckedChange={(v) => set("is_active", v)} />
              <Label>Active</Label>
            </div>
            <div className="space-y-1.5"><Label>Notes</Label><Input placeholder="Optional notes" value={form.notes} onChange={(e) => set("notes", e.target.value)} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={handleSubmit} disabled={create.isPending || update.isPending}>{editId ? "Save" : "Add"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ── Mechanics Tab ── */
function MechanicsTab() {
  const { data: mechanics, isLoading } = useMechanics();
  const create = useCreateMechanic();
  const update = useUpdateMechanic();
  const del = useDeleteMechanic();
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const emptyForm = { name: "", phone: "", email: "", specialization: "", is_active: true, notes: "" };
  const [form, setForm] = useState(emptyForm);
  const set = (key: string, value: string | boolean) => setForm((p) => ({ ...p, [key]: value }));

  const openNew = () => { setEditId(null); setForm(emptyForm); setOpen(true); };
  const openEdit = (m: Mechanic) => {
    setEditId(m.id);
    setForm({ name: m.name, phone: m.phone ?? "", email: m.email ?? "", specialization: m.specialization ?? "", is_active: m.is_active, notes: m.notes ?? "" });
    setOpen(true);
  };

  const handleSubmit = () => {
    if (!form.name) { toast.error("Name is required"); return; }
    const payload = { name: form.name, phone: form.phone || null, email: form.email || null, specialization: form.specialization || null, is_active: form.is_active, notes: form.notes || null };
    const onError = (err: Error) => {
      if (err.message?.includes("mechanics_name_unique")) toast.error("A mechanic with this name already exists");
      else toast.error("Failed to save mechanic");
    };
    if (editId) {
      update.mutate({ id: editId, ...payload }, { onSuccess: () => { toast.success("Updated"); setOpen(false); }, onError });
    } else {
      create.mutate(payload, { onSuccess: () => { toast.success("Added"); setOpen(false); }, onError });
    }
  };

  return (
    <div>
      <div className="flex justify-end mb-4">
        <Button onClick={openNew} size="sm"><Plus className="h-4 w-4 mr-2" />Add Mechanic</Button>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead><TableHead>Phone</TableHead><TableHead>Email</TableHead><TableHead>Specialization</TableHead><TableHead>Status</TableHead><TableHead className="w-24" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {isLoading && <TableRow><TableCell colSpan={6}><TableSkeleton /></TableCell></TableRow>}
          {!isLoading && (!mechanics || mechanics.length === 0) && <EmptyRow colSpan={6} message="No mechanics added yet" />}
          {mechanics?.map((m) => (
            <TableRow key={m.id}>
              <TableCell className="font-medium">{m.name}</TableCell>
              <TableCell>{m.phone || "—"}</TableCell>
              <TableCell>{m.email || "—"}</TableCell>
              <TableCell>{m.specialization || "—"}</TableCell>
              <TableCell><StatusBadge status={m.is_active ? "active" : "inactive"} /></TableCell>
              <TableCell>
                <div className="flex gap-1">
                  <Button variant="ghost" size="icon" onClick={() => openEdit(m)}><Pencil className="h-4 w-4" /></Button>
                  <AlertDialog>
                    <AlertDialogTrigger asChild><Button variant="ghost" size="icon"><Trash2 className="h-4 w-4 text-destructive" /></Button></AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader><AlertDialogTitle>Delete {m.name}?</AlertDialogTitle><AlertDialogDescription>This action cannot be undone.</AlertDialogDescription></AlertDialogHeader>
                      <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={() => del.mutate(m.id, { onSuccess: () => toast.success("Deleted") })}>Delete</AlertDialogAction></AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editId ? "Edit" : "Add"} Mechanic</DialogTitle><DialogDescription>Manage mechanic details for maintenance assignments.</DialogDescription></DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="space-y-1.5"><Label>Name *</Label><Input placeholder="Full name" value={form.name} onChange={(e) => set("name", e.target.value)} /></div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5"><Label>Phone</Label><Input placeholder="+1 555 0123" value={form.phone} onChange={(e) => set("phone", e.target.value)} /></div>
              <div className="space-y-1.5"><Label>Email</Label><Input type="email" placeholder="mechanic@email.com" value={form.email} onChange={(e) => set("email", e.target.value)} /></div>
            </div>
            <div className="space-y-1.5"><Label>Specialization</Label><Input placeholder="e.g. Hydraulic, Electrical" value={form.specialization} onChange={(e) => set("specialization", e.target.value)} /></div>
            <div className="flex items-center gap-2">
              <Switch checked={form.is_active} onCheckedChange={(v) => set("is_active", v)} />
              <Label>Active</Label>
            </div>
            <div className="space-y-1.5"><Label>Notes</Label><Input placeholder="Optional notes" value={form.notes} onChange={(e) => set("notes", e.target.value)} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={handleSubmit} disabled={create.isPending || update.isPending}>{editId ? "Save" : "Add"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ── Main Page ── */
export default function OperationsSetupPage() {
  return (
    <div className="p-6 max-w-5xl">
      <PageHeader title="Operations Setup" subtitle="Manage equipment models, drivers, and mechanics" />
      <Tabs defaultValue="equipment" className="mt-6">
        <TabsList>
          <TabsTrigger value="equipment" className="gap-2"><Settings className="h-4 w-4" />Equipment Models</TabsTrigger>
          <TabsTrigger value="drivers" className="gap-2"><Truck className="h-4 w-4" />Drivers</TabsTrigger>
          <TabsTrigger value="mechanics" className="gap-2"><Wrench className="h-4 w-4" />Mechanics</TabsTrigger>
        </TabsList>
        <TabsContent value="equipment"><EquipmentModelsTab /></TabsContent>
        <TabsContent value="drivers"><DriversTab /></TabsContent>
        <TabsContent value="mechanics"><MechanicsTab /></TabsContent>
      </Tabs>
    </div>
  );
}
