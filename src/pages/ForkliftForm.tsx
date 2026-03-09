import { useNavigate, useParams } from "react-router-dom";
import { useForklift, useCreateForklift, useUpdateForklift } from "@/hooks/useForklifts";
import { useForklifts } from "@/hooks/useForklifts";
import { useEquipmentModels } from "@/hooks/useEquipmentModels";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { FormActions } from "@/components/FormActions";
import { FormPageHeader } from "@/components/FormPageHeader";
import { NotesCard } from "@/components/NotesCard";
import { FORKLIFT_STATUSES, FUEL_TYPES, STATUS_LABELS, FUEL_TYPE_LABELS } from "@/lib/constants";
import { forkliftFormSchema, type ForkliftFormData } from "@/lib/formSchemas";
import { useFormState } from "@/hooks/useFormState";
import { useEffect, useMemo } from "react";
import { toast } from "sonner";
import { AlertTriangle } from "lucide-react";

const emptyForm: ForkliftFormData = {
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
  acquisition_cost: "",
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
    const set = new Set(equipmentModels.map((m) => m.manufacturer));
    if (existing?.manufacturer && !set.has(existing.manufacturer)) set.add(existing.manufacturer);
    return [...set].sort();
  }, [equipmentModels, existing]);

  const filteredModels = useMemo(() => {
    if (!equipmentModels || !form.manufacturer) return [];
    const models = equipmentModels.filter((m) => m.manufacturer === form.manufacturer);
    if (existing?.model && existing?.manufacturer === form.manufacturer && !models.some((m) => m.model === existing.model)) {
      models.push({ id: "fallback", manufacturer: form.manufacturer, model: existing.model, default_capacity_kg: null, default_mast_height_m: null, default_fuel_type: "Diesel", created_at: "", updated_at: "" });
    }
    return models;
  }, [equipmentModels, form.manufacturer, existing]);

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
        acquisition_cost: (existing as any).acquisition_cost?.toString() || "",
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

  const { data: allForklifts } = useForklifts();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = forkliftFormSchema.safeParse(form);
    if (!parsed.success) {
      toast.error(parsed.error.issues[0].message);
      return;
    }

    const others = allForklifts?.filter((f) => f.id !== id) ?? [];
    if (others.some((f) => f.name === form.name)) {
      toast.error("Ya existe un montacargas con este nombre");
      return;
    }
    if (form.serial_number && others.some((f) => f.serial_number === form.serial_number)) {
      toast.error("Ya existe un montacargas con este número de serie");
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
      acquisition_cost: form.acquisition_cost ? parseFloat(form.acquisition_cost) : 0,
      notes: form.notes || null,
    };

    const onError = (err: Error) => {
      if (err.message?.includes("forklifts_name_unique")) {
        toast.error("Ya existe un montacargas con este nombre");
      } else if (err.message?.includes("forklifts_serial_number_unique")) {
        toast.error("Ya existe un montacargas con este número de serie");
      } else {
        toast.error(err.message);
      }
    };

    if (isEdit) {
      update.mutate({ id, ...payload }, {
        onSuccess: () => { toast.success("Montacargas actualizado"); navigate(`/fleet/${id}`); },
        onError,
      });
    } else {
      create.mutate(payload, {
        onSuccess: () => { toast.success("Montacargas agregado"); navigate("/fleet"); },
        onError,
      });
    }
  };

  if (!isEdit && !hasModels) {
    return (
      <div className="p-6 max-w-3xl">
        <FormPageHeader title="Agregar Montacargas" />
        <Alert className="mt-6">
          <AlertTriangle className="h-5 w-5" />
          <AlertTitle>Configura modelos de equipo primero</AlertTitle>
          <AlertDescription className="mt-2">
            Para agregar un montacargas, primero debes registrar al menos un modelo de equipo en Configuración de Operaciones.
          </AlertDescription>
        </Alert>
        <div className="flex gap-3 mt-4">
          <Button onClick={() => navigate("/settings/operations")}>Ir a Configuración</Button>
          <Button variant="outline" onClick={() => navigate(-1)}>Volver</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-3xl">
      <FormPageHeader title={isEdit ? "Editar Montacargas" : "Agregar Montacargas"} />

      <form onSubmit={handleSubmit} className="space-y-6">
        <Card>
          <CardHeader><CardTitle className="text-base">Detalles del Equipo</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Nombre / ID *</Label>
              <Input placeholder="MC-007" value={form.name} onChange={(e) => set("name", e.target.value)} />
            </div>

            <div className="space-y-1.5">
              <Label>Fabricante</Label>
              <Select value={form.manufacturer} onValueChange={handleManufacturerChange}>
                <SelectTrigger><SelectValue placeholder="Seleccionar fabricante" /></SelectTrigger>
                <SelectContent>
                  {manufacturers.map((m) => (
                    <SelectItem key={m} value={m}>{m}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Modelo *</Label>
              <Select value={form.model} onValueChange={handleModelChange} disabled={!form.manufacturer}>
                <SelectTrigger><SelectValue placeholder={form.manufacturer ? "Seleccionar modelo" : "Primero selecciona fabricante"} /></SelectTrigger>
                <SelectContent>
                  {filteredModels.map((m) => (
                    <SelectItem key={m.id} value={m.model}>{m.model}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Año</Label>
              <Input type="number" placeholder="2023" value={form.year} onChange={(e) => set("year", e.target.value)} />
            </div>

            <div className="space-y-1.5">
              <Label>Capacidad (kg)</Label>
              <Input type="number" placeholder="2500" value={form.capacity_kg} onChange={(e) => set("capacity_kg", e.target.value)} />
            </div>

            <div className="space-y-1.5">
              <Label>Altura del Mástil (m)</Label>
              <Input type="number" placeholder="4.5" value={form.mast_height_m} onChange={(e) => set("mast_height_m", e.target.value)} />
            </div>

            <div className="space-y-1.5">
              <Label>Número de Serie</Label>
              <Input placeholder="HY-2023-007" value={form.serial_number} onChange={(e) => set("serial_number", e.target.value)} />
            </div>

            <div className="space-y-1.5">
              <Label>Tipo de Combustible</Label>
              <Select value={form.fuel_type} onValueChange={(v) => set("fuel_type", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {FUEL_TYPES.map((f) => (
                    <SelectItem key={f} value={f}>{FUEL_TYPE_LABELS[f] || f}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {!isEdit && (
              <div className="space-y-1.5">
                <Label>Estado Inicial</Label>
                <Select value={form.status} onValueChange={(v) => set("status", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {FORKLIFT_STATUSES.map((s) => (
                      <SelectItem key={s} value={s}>{STATUS_LABELS[s] || s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Tarifas y Costos</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Tarifa Diaria ($)</Label>
              <Input type="number" placeholder="150" value={form.daily_rate} onChange={(e) => set("daily_rate", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Tarifa Semanal ($)</Label>
              <Input type="number" placeholder="750" value={form.weekly_rate} onChange={(e) => set("weekly_rate", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Tarifa Mensual ($)</Label>
              <Input type="number" placeholder="2500" value={form.monthly_rate} onChange={(e) => set("monthly_rate", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Costo de Adquisición ($)</Label>
              <Input type="number" placeholder="250000" value={form.acquisition_cost} onChange={(e) => set("acquisition_cost", e.target.value)} />
            </div>
          </CardContent>
        </Card>

        <NotesCard value={form.notes} onChange={(v) => set("notes", v)} placeholder="Notas internas sobre este montacargas..." />

        <FormActions submitLabel={isEdit ? "Guardar Cambios" : "Agregar Montacargas"} isPending={create.isPending || update.isPending} onCancel={() => navigate(-1)} />
      </form>
    </div>
  );
}
