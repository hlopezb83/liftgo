import { useId, useState } from "react";
import { FormDialog, FormDialogFooter } from "@/components/forms/FormDialog";
import { FormDialogCancelButton } from "@/components/forms/FormDialogCancelButton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FUEL_TYPES, FUEL_TYPE_LABELS } from "@/lib/constants";
import { listPlatformEquipmentModelsFn, type PlatformEquipmentModelRow } from "@/lib/platformCatalog.functions";
import { notifyValidation } from "@/lib/ui/appFeedback";
import { useSavePlatformEquipmentModel } from "../hooks/usePlatformEquipmentCatalog";
import { isPlatformEditConflict } from "../lib/platformEditConflict";
import { PlatformCurrentFields, PlatformEditConflict } from "./PlatformEditConflict";

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
  const fuelId = useId();
  const [expectedUpdatedAt, setExpectedUpdatedAt] = useState(model?.updated_at);
  const [specifications, setSpecifications] = useState(model?.specifications ?? {});
  const conflict = isPlatformEditConflict(save.error);
  const [baseline] = useState<FormState>(() => model ? {
    manufacturer: model.manufacturer,
    model: model.model,
    capacity: model.capacity_kg?.toString() ?? "",
    mastHeight: model.mast_height_m?.toString() ?? "",
    fuelType: model.fuel_type ?? "Diesel",
    imageUrl: model.image_url ?? "",
    specSheetUrl: model.spec_sheet_url ?? "",
  } : EMPTY);
  const [form, setForm] = useState(baseline);
  const set = (key: keyof FormState, value: string) =>
    setForm((current) => ({ ...current, [key]: value }));

  const submit = () => {
    if (save.isPending || conflict) return;
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
      expected_updated_at: expectedUpdatedAt,
      manufacturer: form.manufacturer,
      model: form.model,
      capacity_kg: capacity,
      mast_height_m: mastHeight,
      fuel_type: form.fuelType,
      specifications,
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
      isDirty={JSON.stringify(form) !== JSON.stringify(baseline) && !save.isSuccess}
    >
      <div className="grid gap-4 py-2">
        {conflict && <PlatformEditConflict loadCurrent={async () => {
          const current = (await listPlatformEquipmentModelsFn()).find((row) => row.id === model?.id);
          if (!current) throw new Error("El modelo ya no está disponible.");
          setSpecifications(current.specifications);
          return { token: current.updated_at, preview: <PlatformCurrentFields values={{
            Fabricante: current.manufacturer, Modelo: current.model, "Capacidad (kg)": String(current.capacity_kg ?? ""),
            "Altura (m)": String(current.mast_height_m ?? ""), Combustible: current.fuel_type ?? "",
            Imagen: current.image_url ?? "", "Ficha técnica": current.spec_sheet_url ?? "",
          }} /> };
        }} onUseCurrent={(token) => { if (token) { setExpectedUpdatedAt(token); save.reset(); } }} />}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Fabricante *" value={form.manufacturer} onChange={(value) => set("manufacturer", value)} />
          <Field label="Modelo *" value={form.model} onChange={(value) => set("model", value)} />
          <Field label="Capacidad (kg)" type="number" value={form.capacity} onChange={(value) => set("capacity", value)} />
          <Field label="Altura de mástil (m)" type="number" value={form.mastHeight} onChange={(value) => set("mastHeight", value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={fuelId}>Combustible</Label>
          <Select value={form.fuelType} onValueChange={(value) => set("fuelType", value)}>
            <SelectTrigger id={fuelId}><SelectValue /></SelectTrigger>
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
        <Button onClick={submit} disabled={save.isPending || conflict}>Guardar</Button>
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
  const id = useId();
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} type={type} value={value} onChange={(event) => onChange(event.target.value)} />
    </div>
  );
}
