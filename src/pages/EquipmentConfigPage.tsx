import { useState } from "react";
import { useEquipmentModels, useCreateEquipmentModel, useUpdateEquipmentModel, useDeleteEquipmentModel, EquipmentModel } from "@/hooks/useEquipmentModels";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { TableSkeleton } from "@/components/TableSkeleton";
import { EmptyRow } from "@/components/EmptyRow";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";

const emptyForm = { manufacturer: "", model: "", default_capacity_kg: "", default_mast_height_m: "", default_fuel_type: "Diesel" };

export default function EquipmentConfigPage() {
  const { data: models, isLoading } = useEquipmentModels();
  const create = useCreateEquipmentModel();
  const update = useUpdateEquipmentModel();
  const del = useDeleteEquipmentModel();

  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);

  const set = (key: string, value: string) => setForm((p) => ({ ...p, [key]: value }));

  const openNew = () => { setEditId(null); setForm(emptyForm); setOpen(true); };
  const openEdit = (m: EquipmentModel) => {
    setEditId(m.id);
    setForm({
      manufacturer: m.manufacturer,
      model: m.model,
      default_capacity_kg: m.default_capacity_kg?.toString() ?? "",
      default_mast_height_m: m.default_mast_height_m?.toString() ?? "",
      default_fuel_type: m.default_fuel_type,
    });
    setOpen(true);
  };

  const handleSubmit = () => {
    if (!form.manufacturer || !form.model) { toast.error("Manufacturer and model are required"); return; }
    const payload = {
      manufacturer: form.manufacturer,
      model: form.model,
      default_capacity_kg: form.default_capacity_kg ? parseFloat(form.default_capacity_kg) : null,
      default_mast_height_m: form.default_mast_height_m ? parseFloat(form.default_mast_height_m) : null,
      default_fuel_type: form.default_fuel_type,
    };
    if (editId) {
      update.mutate({ id: editId, ...payload }, { onSuccess: () => { toast.success("Updated"); setOpen(false); } });
    } else {
      create.mutate(payload, { onSuccess: () => { toast.success("Added"); setOpen(false); } });
    }
  };

  const handleDelete = (id: string) => {
    del.mutate(id, { onSuccess: () => toast.success("Deleted") });
  };

  return (
    <div className="p-6 max-w-5xl">
      <div className="flex items-center justify-between mb-6">
        <PageHeader title="Equipment Configuration" subtitle="Manage manufacturers, models, and default specs" />
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button onClick={openNew}><Plus className="h-4 w-4 mr-2" />Add Model</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editId ? "Edit" : "Add"} Equipment Model</DialogTitle>
              <DialogDescription>Define a manufacturer/model combination with default specs.</DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-2">
              <div className="space-y-1.5">
                <Label>Manufacturer *</Label>
                <Input placeholder="e.g. Hyster" value={form.manufacturer} onChange={(e) => set("manufacturer", e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Model *</Label>
                <Input placeholder="e.g. H50" value={form.model} onChange={(e) => set("model", e.target.value)} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>Default Capacity (kg)</Label>
                  <Input type="number" placeholder="2500" value={form.default_capacity_kg} onChange={(e) => set("default_capacity_kg", e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>Default Mast Height (m)</Label>
                  <Input type="number" placeholder="4.5" value={form.default_mast_height_m} onChange={(e) => set("default_mast_height_m", e.target.value)} />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Default Fuel Type</Label>
                <Select value={form.default_fuel_type} onValueChange={(v) => set("default_fuel_type", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {["Diesel", "Electric", "LPG", "Gasoline"].map((f) => (
                      <SelectItem key={f} value={f}>{f}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button onClick={handleSubmit} disabled={create.isPending || update.isPending}>
                {editId ? "Save" : "Add"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Manufacturer</TableHead>
            <TableHead>Model</TableHead>
            <TableHead>Capacity (kg)</TableHead>
            <TableHead>Mast Height (m)</TableHead>
            <TableHead>Fuel Type</TableHead>
            <TableHead className="w-24" />
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
                    <AlertDialogTrigger asChild>
                      <Button variant="ghost" size="icon"><Trash2 className="h-4 w-4 text-destructive" /></Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Delete {m.manufacturer} {m.model}?</AlertDialogTitle>
                        <AlertDialogDescription>This won't affect existing forklifts. This action cannot be undone.</AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={() => handleDelete(m.id)}>Delete</AlertDialogAction>
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
  );
}
