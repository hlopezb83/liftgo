import { useId, useState } from "react";
import { QueryErrorState } from "@/components/feedback/QueryErrorState";
import { FormDialog, FormDialogFooter } from "@/components/forms/FormDialog";
import { FormDialogCancelButton } from "@/components/forms/FormDialogCancelButton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { usePrefillEffect } from "@/hooks/usePrefillEffect";
import { useUnsavedChangesGuard } from "@/hooks/useUnsavedChangesGuard";
import { notifyValidation } from "@/lib/ui/appFeedback";
import { useActivateCatalogPart } from "../../hooks/usePartInventoryMutations";
import { usePartsCatalog, type PartCatalog } from "../../hooks/usePartsInventory";

export function ActivatePartDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { data: catalog = [], isLoading, isError, isFetching, refetch } = usePartsCatalog();
  const activate = useActivateCatalogPart();
  const [catalogPartId, setCatalogPartId] = useState("");
  const [stock, setStock] = useState("0");
  const [minimum, setMinimum] = useState("0");
  const [cost, setCost] = useState("0");
  const [location, setLocation] = useState("");
  const catalogId = useId();
  const catalogReady = !isLoading && !isError;
  const selectedActive = catalogReady && catalog.some((part) => part.id === catalogPartId);
  const isDirty = !!catalogPartId || stock !== "0" || minimum !== "0" || cost !== "0" || !!location;
  useUnsavedChangesGuard(open && isDirty && !activate.isPending);
  usePrefillEffect(() => {
    if (!open) return;
    setCatalogPartId("");
    setStock("0");
    setMinimum("0");
    setCost("0");
    setLocation("");
  }, [open]);

  const submit = () => {
    if (!catalogReady || activate.isPending) return;
    const values = [Number(stock), Number(minimum), Number(cost)];
    if (!selectedActive) {
      notifyValidation({ message: "Selecciona un SKU del catálogo LiftGo" });
      return;
    }
    if (!Number.isInteger(values[0]) || !Number.isInteger(values[1])) {
      notifyValidation({ message: "Las existencias y el mínimo deben ser enteros" });
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
      isDirty={isDirty}
    >
      <div className="grid gap-4 py-2">
        <CatalogPicker id={catalogId} catalog={catalog} value={catalogPartId} onChange={setCatalogPartId}
          loading={isLoading} error={isError} retrying={isFetching} pending={activate.isPending}
          onRetry={() => { void refetch(); }} />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Field label="Stock inicial" value={stock} onChange={setStock} type="number" />
          <Field label="Stock mínimo" value={minimum} onChange={setMinimum} type="number" />
          <Field label="Costo unitario" value={cost} onChange={setCost} type="number" />
        </div>
        <Field label="Ubicación" value={location} onChange={setLocation} placeholder="Ej. Pasillo A · Estante 3" />
      </div>
      <FormDialogFooter>
        <FormDialogCancelButton onCancel={() => onOpenChange(false)} disabled={activate.isPending} />
        <Button onClick={submit} disabled={activate.isPending || !selectedActive}>Habilitar</Button>
      </FormDialogFooter>
    </FormDialog>
  );
}

function CatalogPicker({ id, catalog, value, onChange, loading, error, retrying, pending, onRetry }: {
  id: string; catalog: PartCatalog[]; value: string; onChange: (value: string) => void;
  loading: boolean; error: boolean; retrying: boolean; pending: boolean; onRetry: () => void;
}) {
  if (error) return <QueryErrorState entity="el catálogo LiftGo" bare isRetrying={retrying} onRetry={onRetry} />;
  return <div className="space-y-1.5">
    <Label htmlFor={id}>SKU LiftGo *</Label>
    <Select value={value} onValueChange={onChange} disabled={loading || catalog.length === 0 || pending}>
      <SelectTrigger id={id}><SelectValue placeholder={loading ? "Cargando…" : catalog.length === 0 ? "Sin SKUs disponibles" : "Seleccionar SKU"} /></SelectTrigger>
      <SelectContent>
        {catalog.map((part) => <SelectItem key={part.id} value={part.id}>{part.sku} · {part.name}</SelectItem>)}
      </SelectContent>
    </Select>
    {!loading && catalog.length === 0 && <p className="text-sm text-muted-foreground">El operador de plataforma debe capturar primero el maestro real de SKUs.</p>}
  </div>;
}

function Field({ label, value, onChange, type = "text", placeholder }: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  placeholder?: string;
}) {
  const id = useId();
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} type={type} min={type === "number" ? 0 : undefined} value={value} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} />
    </div>
  );
}
