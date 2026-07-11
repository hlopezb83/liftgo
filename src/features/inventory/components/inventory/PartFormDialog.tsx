import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@/lib/forms/zodResolver";
import { Button } from "@/components/ui/button";
import { FormDialog, FormDialogFooter } from "@/components/forms/FormDialog";
import { FormSection } from "@/components/forms/FormSection";
import { Form } from "@/components/ui/form";
import {
  TextField,
  SelectField,
  NumberField,
  CurrencyField,
  type SelectOption,
} from "@/components/forms/fields";
import { useCreatePart, useUpdatePart, type PartInventory } from "../../hooks/usePartsInventory";
import { partFormSchema, type PartFormData } from "../../lib/partFormSchema";

const PART_CATEGORIES = ["Filtros", "Llantas", "Aceites", "Baterías", "Otros"] as const;

const CATEGORY_OPTIONS: SelectOption[] = PART_CATEGORIES.map((c) => ({ value: c, label: c }));

interface PartFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  part: PartInventory | null;
}

const empty: PartFormData = {
  name: "", sku: "", category: "Otros", stock_quantity: 0, min_stock_level: 5, unit_cost: 0,
};

export function PartFormDialog({ open, onOpenChange, part }: PartFormDialogProps) {
  const createPart = useCreatePart();
  const updatePart = useUpdatePart();

  const form = useForm<PartFormData>({
    resolver: zodResolver(partFormSchema),
    defaultValues: empty,
  });

  useEffect(() => {
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
          }
        : empty,
    );
  }, [open, part, form]);

  const onSubmit = form.handleSubmit((data) => {
    const payload = {
      name: data.name,
      sku: data.sku || null,
      category: data.category,
      stock_quantity: data.stock_quantity,
      min_stock_level: data.min_stock_level,
      unit_cost: data.unit_cost,
    };
    if (part) {
      updatePart.mutate({ id: part.id, ...payload }, { onSuccess: () => onOpenChange(false) });
    } else {
      createPart.mutate(payload, { onSuccess: () => onOpenChange(false) });
    }
  });

  const isPending = createPart.isPending || updatePart.isPending;

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={part ? "Editar Refacción" : "Nueva Refacción"}
    >
      <Form {...form}>
        <form onSubmit={onSubmit} className="space-y-4">
          <FormSection title="Identidad" first>
            <TextField
              control={form.control}
              name="name"
              label="Nombre"
              required
              placeholder="Ej. Filtro de aceite"
            />
            <TextField control={form.control} name="sku" label="SKU" placeholder="Ej. FLT-001" />
            <SelectField
              control={form.control}
              name="category"
              label="Categoría"
              required
              options={CATEGORY_OPTIONS}
            />
          </FormSection>
          <FormSection title="Inventario y costo">
            <div className="grid grid-cols-3 gap-3">
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
          </FormSection>
          <FormDialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? "Guardando…" : part ? "Guardar" : "Agregar refacción"}
            </Button>
          </FormDialogFooter>
        </form>
      </Form>
    </FormDialog>
  );
}

export { PART_CATEGORIES };
