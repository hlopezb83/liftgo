import { useState } from "react";
import { FormDialog, FormDialogFooter } from "@/components/forms/FormDialog";
import { FormDialogCancelButton } from "@/components/forms/FormDialogCancelButton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FUEL_TYPES, FUEL_TYPE_LABELS } from "@/lib/constants";
import type { PlatformEquipmentModelRow } from "@/lib/platformCatalog.functions";
import { notifyValidation } from "@/lib/ui/appFeedback";
import { useSavePlatformEquipmentModel } from "../hooks/usePlatformEquipmentCatalog";

type FormState = {
  manufacturer: string;
  model: string;
  capacity: string;
  mastHeight: string;
  fuelType: string;
  imageUrl: string;
  specSheetUrl: string;
};

const EMPTY: FormState = {
  manufacturer: "",
  model: "",
  capacity: "",
  mastHeight: "",
  fuelType: "Diesel",
  imageUrl: "",
  specSheetUrl: "",
};

export function PlatformEquipmentModelDialog({
  open,
  onOpenChange,
  model,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  model: PlatformEquipmentModelRow | null;
}) {
  const save = useSavePlatformEquipmentModel();
  const [form, setForm] = useState<FormState>(() => model ? {
    manufacturer: model.manufacturer,
    model: model.model,
    capacity: model.capacity_kg?.toString() ?? "",
    mastHeight: model.mast_height_m?.toString() ?? "",
    fuelType: model.fuel_type ?? "Diesel",
    imageUrl: model.image_url ?? "",
    specSheetUrl: model.spec_sheet_url ?? "",
  } : EMPTY);
  const set = (key: keyof FormState, value: string) =>
    setForm((current) => ({ ...current, [key]: value }));

  const submit = () => {
    if (!form.manufacturer.trim() || !form.model.trim()) {
      notifyValidation({ message: "Fabricante y modelo son obligatorios" });
      return;
    }
    const capacity = form.capacity ? Number(form.capacity) : null;
    const mastHeight = form.mastHeight ? Number(form.mastHeight) : null;
    if ((capacity != null && capacity <= 0) || (mastHeight != null && mastHeight <= 0)) {
      notifyValidation({ message: "Capacidad y altura deben ser mayores que cero" });
      return;
    }
    save.mutate({
      id: model?.id,
      manufacturer: form.manufacturer,
      model: form.model,
      capacity_kg: capacity,
      mast_height_m: mastHeight,
      fuel_type: form.fuelType,
      specifications: model?.specifications ?? {},
      image_url: form.imageUrl || null,
      spec_sheet_url: form.specSheetUrl || null,
    }, { onSuccess: () => onOpenChange(false) });
  };

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={model ? "Editar modelo global" : "Nuevo modelo global"}
      description="La ficha técnica será compartida por todas las organizaciones LiftGo."
      isPending={save.isPending}
    >
      <div className="grid gap-4 py-2">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Fabricante *" value={form.manufacturer} onChange={(value) => set("manufacturer", value)} />
          <Field label="Modelo *" value={form.model} onChange={(value) => set("model", value)} />
          <Field label="Capacidad (kg)" type="number" value={form.capacity} onChange={(value) => set("capacity", value)} />
          <Field label="Altura de mástil (m)" type="number" value={form.mastHeight} onChange={(value) => set("mastHeight", value)} />
        </div>
        <div className="space-y-1.5">
          <Label>Combustible</Label>
          <Select value={form.fuelType} onValueChange={(value) => set("fuelType", value)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {FUEL_TYPES.map((fuel) => <SelectItem key={fuel} value={fuel}>{FUEL_TYPE_LABELS[fuel] || fuel}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <Field label="URL de imagen" value={form.imageUrl} onChange={(value) => set("imageUrl", value)} />
        <Field label="URL de ficha técnica" value={form.specSheetUrl} onChange={(value) => set("specSheetUrl", value)} />
      </div>
      <FormDialogFooter>
        <FormDialogCancelButton onCancel={() => onOpenChange(false)} disabled={save.isPending} />
        <Button onClick={submit} disabled={save.isPending}>Guardar</Button>
      </FormDialogFooter>
    </FormDialog>
  );
}

function Field({ label, value, onChange, type = "text" }: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <Input type={type} value={value} onChange={(event) => onChange(event.target.value)} />
    </div>
  );
}
