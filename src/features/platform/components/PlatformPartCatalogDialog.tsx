import { useState } from "react";
import { FormDialog, FormDialogFooter } from "@/components/forms/FormDialog";
import { FormDialogCancelButton } from "@/components/forms/FormDialogCancelButton";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { PlatformEquipmentModelRow, PlatformPartCatalogRow } from "@/lib/platformCatalog.functions";
import { notifyValidation } from "@/lib/ui/appFeedback";
import { useSavePlatformPartCatalog } from "../hooks/usePlatformEquipmentCatalog";

type FormState = {
  sku: string;
  name: string;
  description: string;
  manufacturer: string;
  oemNumbers: string;
  category: string;
  unitOfMeasure: string;
  imageUrl: string;
  modelIds: string[];
};

const EMPTY: FormState = {
  sku: "", name: "", description: "", manufacturer: "", oemNumbers: "",
  category: "", unitOfMeasure: "pieza", imageUrl: "", modelIds: [],
};

export function PlatformPartCatalogDialog({
  open,
  onOpenChange,
  part,
  models,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  part: PlatformPartCatalogRow | null;
  models: PlatformEquipmentModelRow[];
}) {
  const save = useSavePlatformPartCatalog();
  const [form, setForm] = useState<FormState>(() => part ? {
    sku: part.sku,
    name: part.name,
    description: part.description ?? "",
    manufacturer: part.manufacturer ?? "",
    oemNumbers: part.oem_numbers.join(", "),
    category: part.category ?? "",
    unitOfMeasure: part.unit_of_measure,
    imageUrl: part.image_url ?? "",
    modelIds: part.equipment_model_ids,
  } : EMPTY);
  const set = (key: keyof FormState, value: string | string[]) =>
    setForm((current) => ({ ...current, [key]: value }));
  const toggleModel = (id: string, checked: boolean) => set(
    "modelIds",
    checked ? [...form.modelIds, id] : form.modelIds.filter((value) => value !== id),
  );

  const submit = () => {
    if (!form.sku.trim() || !form.name.trim() || !form.unitOfMeasure.trim()) {
      notifyValidation({ message: "SKU, nombre y unidad de medida son obligatorios" });
      return;
    }
    save.mutate({
      id: part?.id,
      sku: form.sku,
      name: form.name,
      description: form.description || null,
      manufacturer: form.manufacturer || null,
      oem_numbers: form.oemNumbers.split(",").map((value) => value.trim()).filter(Boolean),
      category: form.category || null,
      unit_of_measure: form.unitOfMeasure,
      image_url: form.imageUrl || null,
      equipment_model_ids: form.modelIds,
    }, { onSuccess: () => onOpenChange(false) });
  };

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={part ? "Editar SKU global" : "Nuevo SKU global"}
      description="La identidad técnica será compartida por todas las organizaciones LiftGo."
      isPending={save.isPending}
    >
      <div className="grid gap-4 py-2">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="SKU *" value={form.sku} onChange={(value) => set("sku", value)} />
          <Field label="Nombre *" value={form.name} onChange={(value) => set("name", value)} />
          <Field label="Fabricante" value={form.manufacturer} onChange={(value) => set("manufacturer", value)} />
          <Field label="Categoría" value={form.category} onChange={(value) => set("category", value)} />
          <Field label="Unidad de medida *" value={form.unitOfMeasure} onChange={(value) => set("unitOfMeasure", value)} />
          <Field label="Números OEM (separados por coma)" value={form.oemNumbers} onChange={(value) => set("oemNumbers", value)} />
        </div>
        <div className="space-y-1.5">
          <Label>Descripción</Label>
          <Textarea value={form.description} onChange={(event) => set("description", event.target.value)} />
        </div>
        <Field label="URL de imagen" value={form.imageUrl} onChange={(value) => set("imageUrl", value)} />
        <div className="space-y-2">
          <Label>Modelos compatibles</Label>
          <div className="grid max-h-40 grid-cols-1 gap-2 overflow-y-auto rounded-md border p-3 sm:grid-cols-2">
            {models.map((model) => (
              <label key={model.id} className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={form.modelIds.includes(model.id)}
                  onCheckedChange={(checked) => toggleModel(model.id, checked === true)}
                />
                {model.manufacturer} {model.model}
              </label>
            ))}
            {models.length === 0 && <p className="text-sm text-muted-foreground">No hay modelos globales.</p>}
          </div>
        </div>
      </div>
      <FormDialogFooter>
        <FormDialogCancelButton onCancel={() => onOpenChange(false)} disabled={save.isPending} />
        <Button onClick={submit} disabled={save.isPending}>Guardar</Button>
      </FormDialogFooter>
    </FormDialog>
  );
}

function Field({ label, value, onChange }: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return <div className="space-y-1.5"><Label>{label}</Label><Input value={value} onChange={(event) => onChange(event.target.value)} /></div>;
}
