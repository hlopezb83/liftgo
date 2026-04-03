import { useEffect, useState } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { format } from "date-fns";
import { nowMty } from "@/lib/utils";
import { Plus } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DatePickerField } from "@/components/DatePickerField";
import { FormActions } from "@/components/FormActions";
import { expenseFormSchema, type ExpenseFormData } from "@/lib/formSchemas";
import { useCreateExpense, EXPENSE_CATEGORY_LABELS, type ExpenseCategory } from "@/hooks/useOperatingExpenses";
import { SupplierSelector } from "@/components/suppliers/SupplierSelector";

const EXCLUDED_CATEGORIES = ["software", "depreciacion"];

const CATEGORY_DISPLAY: Record<string, string> = Object.fromEntries(
  Object.entries(EXPENSE_CATEGORY_LABELS).filter(([key]) => !EXCLUDED_CATEGORIES.includes(key))
);

const CATEGORIES = Object.entries(CATEGORY_DISPLAY) as [ExpenseCategory, string][];

interface ExpenseFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ExpenseFormDialog({ open, onOpenChange }: ExpenseFormDialogProps) {
  const createExpense = useCreateExpense();
  const [supplierId, setSupplierId] = useState("");

  const form = useForm<ExpenseFormData>({
    resolver: zodResolver(expenseFormSchema),
    defaultValues: {
      expense_date: nowMty(),
      amount: undefined as unknown as number,
      category: "",
      description: "",
    },
  });

  useEffect(() => {
    if (open) {
      setSupplierId("");
      form.reset({
        expense_date: new Date(),
        amount: undefined as unknown as number,
        category: "",
        description: "",
      });
    }
  }, [open, form]);

  const onSubmit = (data: ExpenseFormData) => {
    createExpense.mutate(
      {
        category: data.category as ExpenseCategory,
        description: data.description || undefined,
        amount: data.amount,
        expense_date: format(data.expense_date, "yyyy-MM-dd"),
        is_recurring: false,
        supplier_id: supplierId || null,
      },
      { onSuccess: () => onOpenChange(false) },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Registrar Gasto</DialogTitle>
        </DialogHeader>

        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          {/* Fecha */}
          <div>
            <Controller
              control={form.control}
              name="expense_date"
              render={({ field }) => (
                <DatePickerField
                  label="Fecha"
                  date={field.value}
                  onSelect={(d) => field.onChange(d ?? new Date())}
                  required
                />
              )}
            />
            {form.formState.errors.expense_date && (
              <p className="text-sm text-destructive mt-1">{form.formState.errors.expense_date.message}</p>
            )}
          </div>

          {/* Monto */}
          <div className="space-y-1.5">
            <Label>Monto *</Label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
              <Input
                type="number"
                min="0"
                step="0.01"
                className="pl-7"
                placeholder="0.00"
                {...form.register("amount", { valueAsNumber: true })}
              />
            </div>
            {form.formState.errors.amount && (
              <p className="text-sm text-destructive">{form.formState.errors.amount.message}</p>
            )}
          </div>

          {/* Categoría */}
          <div className="space-y-1.5">
            <Label>Categoría *</Label>
            <Controller
              control={form.control}
              name="category"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecciona categoría" />
                  </SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map(([v, l]) => (
                      <SelectItem key={v} value={v}>{l}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
            {form.formState.errors.category && (
              <p className="text-sm text-destructive">{form.formState.errors.category.message}</p>
            )}
          </div>

          {/* Proveedor */}
          <SupplierSelector value={supplierId} onChange={setSupplierId} />

          {/* Descripción */}
          <div className="space-y-1.5">
            <Label>Descripción (opcional)</Label>
            <Textarea rows={2} {...form.register("description")} />
          </div>

          <DialogFooter>
            <FormActions
              submitLabel="Registrar"
              isPending={createExpense.isPending}
              onCancel={() => onOpenChange(false)}
            />
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
