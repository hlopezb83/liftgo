import { Controller, type UseFormReturn } from "react-hook-form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DatePickerField } from "@/components/DatePickerField";
import { nowMty } from "@/lib/utils";
import type { ExpenseFormData } from "@/lib/formSchemas";
import { EXPENSE_CATEGORY_LABELS, type ExpenseCategory } from "@/features/expenses/hooks/useOperatingExpenses";
import { SupplierSelector } from "@/features/suppliers/components/suppliers/SupplierSelector";

const EXCLUDED_CATEGORIES = ["software", "depreciacion"];
const CATEGORIES = Object.entries(EXPENSE_CATEGORY_LABELS)
  .filter(([key]) => !EXCLUDED_CATEGORIES.includes(key)) as [ExpenseCategory, string][];

interface Props {
  form: UseFormReturn<ExpenseFormData>;
  supplierId: string;
  setSupplierId: (id: string) => void;
}

export function ExpenseFormFields({ form, supplierId, setSupplierId }: Props) {
  return (
    <>
      <div>
        <Controller
          control={form.control}
          name="expense_date"
          render={({ field }) => (
            <DatePickerField
              label="Fecha"
              date={field.value}
              onSelect={(d) => field.onChange(d ?? nowMty())}
              required
            />
          )}
        />
        {form.formState.errors.expense_date && (
          <p className="text-sm text-destructive mt-1">{form.formState.errors.expense_date.message}</p>
        )}
      </div>

      <div className="space-y-1.5">
        <Label>Monto *</Label>
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
          <Input
            type="number" min="0" step="0.01" className="pl-7" placeholder="0.00"
            {...form.register("amount", { valueAsNumber: true })}
          />
        </div>
        {form.formState.errors.amount && (
          <p className="text-sm text-destructive">{form.formState.errors.amount.message}</p>
        )}
      </div>

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

      <SupplierSelector value={supplierId} onChange={setSupplierId} />

      <div className="space-y-1.5">
        <Label>Descripción (opcional)</Label>
        <Textarea rows={2} {...form.register("description")} />
      </div>
    </>
  );
}
