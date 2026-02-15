import { useNavigate, useParams } from "react-router-dom";
import { useForklift, useCreateForklift, useUpdateForklift } from "@/hooks/useForkliftData";
import { useEquipmentModels } from "@/hooks/useEquipmentModels";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FormActions } from "@/components/FormActions";
import { FormPageHeader } from "@/components/FormPageHeader";
import { NotesCard } from "@/components/NotesCard";
import { FORKLIFT_STATUSES, FUEL_TYPES } from "@/lib/constants";
import { useFormState } from "@/hooks/useFormState";
import { useEffect, useMemo } from "react";
import { toast } from "sonner";

const emptyForm = {
  name: "",
  model: "",
  manufacturer: "",
  year: "",
  capacity_kg: "",
  mast_height_m: "",
  fuel_type: "Diesel",
  serial_number: "",
  status: "available",
  daily_rate: "",
  weekly_rate: "",
  monthly_rate: "",
  notes: "",
};

export default function ForkliftForm() {
  const { id } = useParams();
  const isEdit = !!id;
  const navigate = useNavigate();
  const { data: existing } = useForklift(id);
  const create = useCreateForklift();
  const update = useUpdateForklift();
  const { data: equipmentModels } = useEquipmentModels();
  const { form, set, setForm } = useFormState(emptyForm);

  const hasModels = equipmentModels && equipmentModels.length > 0;

  const manufacturers = useMemo(() => {
    if (!equipmentModels) return [];
    return [...new Set(equipmentModels.map((m) => m.manufacturer))].sort();
  }, [equipmentModels]);

  const filteredModels = useMemo(() => {
    if (!equipmentModels || !form.manufacturer) return [];
    return equipmentModels.filter((m) => m.manufacturer === form.manufacturer);
  }, [equipmentModels, form.manufacturer]);

  useEffect(() => {
    if (existing) {
      setForm({
        name: existing.name,
        model: existing.model,
        manufacturer: existing.manufacturer || "",
        year: existing.year?.toString() || "",
        capacity_kg: existing.capacity_kg?.toString() || "",
        mast_height_m: existing.mast_height_m?.toString() || "",
        fuel_type: existing.fuel_type || "Diesel",
        serial_number: existing.serial_number || "",
        status: existing.status,
        daily_rate: existing.daily_rate?.toString() || "",
        weekly_rate: existing.weekly_rate?.toString() || "",
        monthly_rate: existing.monthly_rate?.toString() || "",
        notes: existing.notes || "",
      });
    }
  }, [existing]);

  const handleManufacturerChange = (value: string) => {
    setForm((prev) => ({ ...prev, manufacturer: value, model: "" }));
  };

  const handleModelChange = (value: string) => {
    const match = equipmentModels?.find((m) => m.manufacturer === form.manufacturer && m.model === value);
    setForm((prev) => ({
      ...prev,
      model: value,
      ...(match ? {
        capacity_kg: match.default_capacity_kg?.toString() ?? prev.capacity_kg,
        mast_height_m: match.default_mast_height_m?.toString() ?? prev.mast_height_m,
        fuel_type: match.default_fuel_type ?? prev.fuel_type,
      } : {}),
    }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name || !form.model) {
      toast.error("Name and model are required");
      return;
    }

    const payload = {
      name: form.name,
      model: form.model,
      manufacturer: form.manufacturer || null,
      year: form.year ? parseInt(form.year) : null,
      capacity_kg: form.capacity_kg ? parseFloat(form.capacity_kg) : null,
      mast_height_m: form.mast_height_m ? parseFloat(form.mast_height_m) : null,
      fuel_type: form.fuel_type,
      serial_number: form.serial_number || null,
      status: form.status,
      daily_rate: form.daily_rate ? parseFloat(form.daily_rate) : 0,
      weekly_rate: form.weekly_rate ? parseFloat(form.weekly_rate) : 0,
      monthly_rate: form.monthly_rate ? parseFloat(form.monthly_rate) : 0,
      notes: form.notes || null,
    };

    if (isEdit) {
      update.mutate({ id, ...payload }, {
        onSuccess: () => { toast.success("Forklift updated"); navigate(`/fleet/${id}`); },
      });
    } else {
      create.mutate(payload, {
        onSuccess: () => { toast.success("Forklift added"); navigate("/fleet"); },
      });
    }
  };

  return (
    <div className="p-6 max-w-3xl">
      <FormPageHeader title={isEdit ? "Edit Forklift" : "Add Forklift"} />

      <form onSubmit={handleSubmit} className="space-y-6">
        <Card>
          <CardHeader><CardTitle className="text-base">Equipment Details</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Name / ID *</Label>
              <Input placeholder="FL-007" value={form.name} onChange={(e) => set("name", e.target.value)} />
            </div>

            <div className="space-y-1.5">
              <Label>Manufacturer</Label>
              {hasModels ? (
                <Select value={form.manufacturer} onValueChange={handleManufacturerChange}>
                  <SelectTrigger><SelectValue placeholder="Select manufacturer" /></SelectTrigger>
                  <SelectContent>
                    {manufacturers.map((m) => (
                      <SelectItem key={m} value={m}>{m}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Input placeholder="Hyster" value={form.manufacturer} onChange={(e) => set("manufacturer", e.target.value)} />
              )}
            </div>

            <div className="space-y-1.5">
              <Label>Model *</Label>
              {hasModels ? (
                <Select value={form.model} onValueChange={handleModelChange} disabled={!form.manufacturer}>
                  <SelectTrigger><SelectValue placeholder={form.manufacturer ? "Select model" : "Pick manufacturer first"} /></SelectTrigger>
                  <SelectContent>
                    {filteredModels.map((m) => (
                      <SelectItem key={m.id} value={m.model}>{m.model}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Input placeholder="H50" value={form.model} onChange={(e) => set("model", e.target.value)} />
              )}
              {!hasModels && (
                <p className="text-xs text-muted-foreground">Tip: Configure models in Equipment Config to use dropdowns here.</p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label>Year</Label>
              <Input type="number" placeholder="2023" value={form.year} onChange={(e) => set("year", e.target.value)} />
            </div>

            <div className="space-y-1.5">
              <Label>Capacity (kg)</Label>
              <Input type="number" placeholder="2500" value={form.capacity_kg} onChange={(e) => set("capacity_kg", e.target.value)} />
            </div>

            <div className="space-y-1.5">
              <Label>Mast Height (m)</Label>
              <Input type="number" placeholder="4.5" value={form.mast_height_m} onChange={(e) => set("mast_height_m", e.target.value)} />
            </div>

            <div className="space-y-1.5">
              <Label>Serial Number</Label>
              <Input placeholder="HY-2023-007" value={form.serial_number} onChange={(e) => set("serial_number", e.target.value)} />
            </div>

            <div className="space-y-1.5">
              <Label>Fuel Type</Label>
              <Select value={form.fuel_type} onValueChange={(v) => set("fuel_type", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {FUEL_TYPES.map((f) => (
                    <SelectItem key={f} value={f}>{f}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {!isEdit && (
              <div className="space-y-1.5">
                <Label>Initial Status</Label>
                <Select value={form.status} onValueChange={(v) => set("status", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {FORKLIFT_STATUSES.map((s) => (
                      <SelectItem key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Rental Pricing</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <Label>Daily Rate ($)</Label>
              <Input type="number" placeholder="150" value={form.daily_rate} onChange={(e) => set("daily_rate", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Weekly Rate ($)</Label>
              <Input type="number" placeholder="750" value={form.weekly_rate} onChange={(e) => set("weekly_rate", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Monthly Rate ($)</Label>
              <Input type="number" placeholder="2500" value={form.monthly_rate} onChange={(e) => set("monthly_rate", e.target.value)} />
            </div>
          </CardContent>
        </Card>

        <NotesCard value={form.notes} onChange={(v) => set("notes", v)} placeholder="Internal notes about this forklift..." />

        <FormActions submitLabel={isEdit ? "Save Changes" : "Add Forklift"} isPending={create.isPending || update.isPending} onCancel={() => navigate(-1)} />
      </form>
    </div>
  );
}
