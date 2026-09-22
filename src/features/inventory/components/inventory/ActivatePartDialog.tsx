import { useState } from "react";
import { FormDialog, FormDialogFooter } from "@/components/forms/FormDialog";
import { FormDialogCancelButton } from "@/components/forms/FormDialogCancelButton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { notifyValidation } from "@/lib/ui/appFeedback";
import { useActivateCatalogPart } from "../../hooks/usePartInventoryMutations";
import { usePartsCatalog } from "../../hooks/usePartsInventory";

export function ActivatePartDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { data: catalog = [], isLoading } = usePartsCatalog();
  const activate = useActivateCatalogPart();
  const [catalogPartId, setCatalogPartId] = useState("");
  const [stock, setStock] = useState("0");
  const [minimum, setMinimum] = useState("0");
  const [cost, setCost] = useState("0");
  const [location, setLocation] = useState("");

  const submit = () => {
    const values = [Number(stock), Number(minimum), Number(cost)];
    if (!catalogPartId) {
      notifyValidation({ message: "Selecciona un SKU del catálogo LiftGo" });
      return;
    }
    if (values.some((value) => !Number.isFinite(value) || value < 0)) {
      notifyValidation({ message: "Existencias, mínimo y costo deben ser valores no negativos" });
      return;
    }
    activate.mutate({
      catalogPartId,
      stockQuantity: values[0],
      minStockLevel: values[1],
      unitCost: values[2],
      location: location || null,
    }, { onSuccess: () => onOpenChange(false) });
  };

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Habilitar refacción"
      description="Selecciona un SKU global y captura únicamente la configuración de esta empresa."
      isPending={activate.isPending}
    >
      <div className="grid gap-4 py-2">
        <div className="space-y-1.5">
          <Label>SKU LiftGo *</Label>
          <Select value={catalogPartId} onValueChange={setCatalogPartId} disabled={isLoading}>
            <SelectTrigger><SelectValue placeholder={isLoading ? "Cargando…" : "Seleccionar SKU"} /></SelectTrigger>
            <SelectContent>
              {catalog.map((part) => (
                <SelectItem key={part.id} value={part.id}>{part.sku} · {part.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {!isLoading && catalog.length === 0 && (
            <p className="text-sm text-muted-foreground">El operador de plataforma debe capturar primero el maestro real de SKUs.</p>
          )}
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Field label="Stock inicial" value={stock} onChange={setStock} type="number" />
          <Field label="Stock mínimo" value={minimum} onChange={setMinimum} type="number" />
          <Field label="Costo unitario" value={cost} onChange={setCost} type="number" />
        </div>
        <Field label="Ubicación" value={location} onChange={setLocation} placeholder="Ej. Pasillo A · Estante 3" />
      </div>
      <FormDialogFooter>
        <FormDialogCancelButton onCancel={() => onOpenChange(false)} disabled={activate.isPending} />
        <Button onClick={submit} disabled={activate.isPending || catalog.length === 0}>Habilitar</Button>
      </FormDialogFooter>
    </FormDialog>
  );
}

function Field({ label, value, onChange, type = "text", placeholder }: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  placeholder?: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <Input type={type} min={type === "number" ? 0 : undefined} value={value} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} />
    </div>
  );
}
