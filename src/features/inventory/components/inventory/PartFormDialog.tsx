import { useForm } from "react-hook-form";
import {
  TextField,
  NumberField,
  CurrencyField,
} from "@/components/forms/fields";
import { FormDialog, FormDialogFooter } from "@/components/forms/FormDialog";
import { FormDialogCancelButton } from "@/components/forms/FormDialogCancelButton";
import { FormSection } from "@/components/forms/FormSection";
import { Button } from "@/components/ui/button";
import { Form } from "@/components/ui/form";
import { usePrefillEffect } from "@/hooks/usePrefillEffect";
import { useUnsavedChangesGuard } from "@/hooks/useUnsavedChangesGuard";
import { zodResolver } from "@/lib/forms/zodResolver";
import { useUpdatePart, type PartInventory } from "../../hooks/usePartsInventory";
import { partFormSchema, type PartFormData } from "../../lib/partFormSchema";

interface PartFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  part: PartInventory | null;
}

const empty: PartFormData = {
  name: "", sku: "", category: "Otros", stock_quantity: 0, min_stock_level: 5, unit_cost: 0, location: "",
};

export function PartFormDialog({ open, onOpenChange, part }: PartFormDialogProps) {
  const updatePart = useUpdatePart();

  const form = useForm<PartFormData>({
    resolver: zodResolver(partFormSchema),
    defaultValues: empty,
  });

  usePrefillEffect(() => {
    if (!open) return;
    form.reset(
      part
        ? {
            name: part.name,
            sku: part.sku || "",
            category: part.category,
            stock_quantity: part.stock_quantity,
            min_stock_level: part.min_stock_level,
            unit_cost: part.unit_cost,
            location: part.location ?? "",
          }
        : empty,
    );
  }, [open, part]);

  const onSubmit = form.handleSubmit((data) => {
    const payload = {
      stock_quantity: data.stock_quantity,
      min_stock_level: data.min_stock_level,
      unit_cost: data.unit_cost,
      location: data.location || null,
    };
    if (!part) return;
    updatePart.mutate({ id: part.id, ...payload }, { onSuccess: () => onOpenChange(false) });
  });

  const isPending = updatePart.isPending;
  useUnsavedChangesGuard(open && form.formState.isDirty && !isPending);

  return (
    <FormDialog
      isPending={isPending}
      isDirty={form.formState.isDirty}
      open={open}
      onOpenChange={onOpenChange}
      title="Editar inventario local"
    >
      <Form {...form}>
        <form onSubmit={onSubmit} className="space-y-4">
          <FormSection title="Identidad LiftGo" first>
            <div className="rounded-md border bg-muted/40 p-3 text-sm">
              <span className="font-mono font-medium">{part?.sku}</span>
              <p>{part?.name}</p>
              <p className="text-muted-foreground">El SKU, nombre y categoría se administran en el catálogo global.</p>
            </div>
          </FormSection>
          <FormSection title="Inventario y costo">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <NumberField
                control={form.control}
                name="stock_quantity"
                label="Stock Inicial"
                min={0}
                nullOnEmpty={false}
              />
              <NumberField
                control={form.control}
                name="min_stock_level"
                label="Stock Mínimo"
                min={0}
                nullOnEmpty={false}
              />
              <CurrencyField
                control={form.control}
                name="unit_cost"
                label="Costo Unitario"
              />
            </div>
            <TextField control={form.control} name="location" label="Ubicación" placeholder="Ej. Pasillo A · Estante 3" />
          </FormSection>
          <FormDialogFooter>
            <FormDialogCancelButton onCancel={() => onOpenChange(false)} disabled={isPending} />
            <Button type="submit" disabled={isPending}>
              {isPending ? "Guardando…" : "Guardar"}
            </Button>
          </FormDialogFooter>
        </form>
      </Form>
    </FormDialog>
  );
}
