import { useNavigate, useParams } from "react-router-dom";
import { useForklift, useCreateForklift, useUpdateForklift } from "@/hooks/useForkliftData";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FormActions } from "@/components/FormActions";
import { ArrowLeft } from "lucide-react";
import { useEffect, useState } from "react";
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
};

export default function ForkliftForm() {
  const { id } = useParams();
  const isEdit = !!id;
  const navigate = useNavigate();
  const { data: existing } = useForklift(id);
  const create = useCreateForklift();
  const update = useUpdateForklift();
  const [form, setForm] = useState(emptyForm);

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
      });
    }
  }, [existing]);

  const set = (key: string, value: string) => setForm((prev) => ({ ...prev, [key]: value }));

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

  const fields = [
    { key: "name", label: "Name / ID", placeholder: "FL-007", required: true },
    { key: "model", label: "Model", placeholder: "H50", required: true },
    { key: "manufacturer", label: "Manufacturer", placeholder: "Hyster" },
    { key: "year", label: "Year", placeholder: "2023", type: "number" },
    { key: "capacity_kg", label: "Capacity (kg)", placeholder: "2500", type: "number" },
    { key: "mast_height_m", label: "Mast Height (m)", placeholder: "4.5", type: "number" },
    { key: "serial_number", label: "Serial Number", placeholder: "HY-2023-007" },
  ];

  return (
    <div className="p-6 max-w-3xl">
      <div className="flex items-center gap-3 mb-6">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h1 className="text-2xl font-bold">{isEdit ? "Edit Forklift" : "Add Forklift"}</h1>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <Card>
          <CardHeader><CardTitle className="text-base">Equipment Details</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {fields.map((f) => (
              <div key={f.key} className="space-y-1.5">
                <Label>{f.label}{f.required && " *"}</Label>
                <Input
                  type={f.type || "text"}
                  placeholder={f.placeholder}
                  value={(form as any)[f.key]}
                  onChange={(e) => set(f.key, e.target.value)}
                />
              </div>
            ))}
            <div className="space-y-1.5">
              <Label>Fuel Type</Label>
              <Select value={form.fuel_type} onValueChange={(v) => set("fuel_type", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["Diesel", "Electric", "LPG", "Gasoline"].map((f) => (
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
                    {["available", "rented", "maintenance", "retired"].map((s) => (
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

        <FormActions submitLabel={isEdit ? "Save Changes" : "Add Forklift"} isPending={create.isPending || update.isPending} onCancel={() => navigate(-1)} />
      </form>
    </div>
  );
}
