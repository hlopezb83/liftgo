/* eslint-disable react-refresh/only-export-components */
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useCreatePart, useUpdatePart, type PartInventory } from "@/features/inventory/hooks/usePartsInventory";
import { partFormSchema, type PartFormData } from "@/features/inventory/lib/partFormSchema";

const PART_CATEGORIES = ["Filtros", "Llantas", "Aceites", "Baterías", "Otros"] as const;

interface PartFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  part: PartInventory | null;
}

export function PartFormDialog({ open, onOpenChange, part }: PartFormDialogProps) {
  const createPart = useCreatePart();
  const updatePart = useUpdatePart();

  const form = useForm<PartFormData>({
    resolver: zodResolver(partFormSchema),
    defaultValues: { name: "", sku: "", category: "Otros", stock_quantity: 0, min_stock_level: 5, unit_cost: 0 },
  });

  useEffect(() => {
    if (!open) return;
    if (part) {
      form.reset({
        name: part.name,
        sku: part.sku || "",
        category: part.category,
        stock_quantity: part.stock_quantity,
        min_stock_level: part.min_stock_level,
        unit_cost: part.unit_cost,
      });
    } else {
      form.reset({ name: "", sku: "", category: "Otros", stock_quantity: 0, min_stock_level: 5, unit_cost: 0 });
    }
  }, [open, part, form]);

  const onSubmit = (data: PartFormData) => {
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
  };

  const isPending = createPart.isPending || updatePart.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{part ? "Editar Refacción" : "Nueva Refacción"}</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField control={form.control} name="name" render={({ field }) => (
              <FormItem>
                <FormLabel>Nombre *</FormLabel>
                <FormControl><Input {...field} placeholder="Ej. Filtro de aceite" /></FormControl>
                <FormMessage />
              </FormItem>
            )} />
            <FormField control={form.control} name="sku" render={({ field }) => (
              <FormItem>
                <FormLabel>SKU</FormLabel>
                <FormControl><Input {...field} placeholder="Ej. FLT-001" /></FormControl>
                <FormMessage />
              </FormItem>
            )} />
            <FormField control={form.control} name="category" render={({ field }) => (
              <FormItem>
                <FormLabel>Categoría *</FormLabel>
                <Select value={field.value} onValueChange={field.onChange}>
                  <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                  <SelectContent>
                    {PART_CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )} />
            <div className="grid grid-cols-3 gap-3">
              <FormField control={form.control} name="stock_quantity" render={({ field }) => (
                <FormItem>
                  <FormLabel>Stock Inicial</FormLabel>
                  <FormControl><Input type="number" min="0" {...field} onChange={(e) => field.onChange(Number(e.target.value))} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="min_stock_level" render={({ field }) => (
                <FormItem>
                  <FormLabel>Stock Mínimo</FormLabel>
                  <FormControl><Input type="number" min="0" {...field} onChange={(e) => field.onChange(Number(e.target.value))} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="unit_cost" render={({ field }) => (
                <FormItem>
                  <FormLabel>Costo Unitario</FormLabel>
                  <FormControl>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
                      <Input type="number" min="0" step="0.01" className="pl-7" {...field} onChange={(e) => field.onChange(Number(e.target.value))} />
                    </div>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
              <Button type="submit" disabled={isPending}>
                {isPending ? "Guardando…" : "Guardar"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

export { PART_CATEGORIES };
