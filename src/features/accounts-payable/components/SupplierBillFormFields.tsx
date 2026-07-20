import {
  TextField, DateField, NumberField, CurrencyField, type SelectOption,
} from "@/components/forms/fields";
import { FormField, FormItem, FormLabel, FormControl, FormMessage } from "@/components/ui/form";
import {
  Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toYMD } from "@/lib/date/toYMD";
import { formatDateDisplay } from "@/lib/utils";
import {
  EXPENSE_CATEGORY_LABELS,
  EXPENSE_CATEGORY_GROUPS,
  PAYMENT_METHOD_SAT_OPTIONS,
} from "../lib/supplierBillConstants";
import type { UseFormReturn } from "react-hook-form";

interface Props {
  form: UseFormReturn<Record<string, unknown>>;
  currency: string;
  currencyOptions: SelectOption[];
  selectedSupplier: { default_payment_terms_days?: number | null } | null | undefined;
  suggestedDueDate: Date | null | undefined;
}

export function SupplierBillFormFields({ form, currency, currencyOptions, selectedSupplier, suggestedDueDate }: Props) {
  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <FormField
          control={form.control}
          name="category"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Categoría *</FormLabel>
              <Select value={field.value as string} onValueChange={field.onChange}>
                <FormControl><SelectTrigger><SelectValue placeholder="Seleccionar" /></SelectTrigger></FormControl>
                <SelectContent>
                  {EXPENSE_CATEGORY_GROUPS.map((g) => (
                    <SelectGroup key={g.label}>
                      <SelectLabel>{g.label}</SelectLabel>
                      {g.categories.map((v) => (
                        <SelectItem key={v} value={v}>{EXPENSE_CATEGORY_LABELS[v]}</SelectItem>
                      ))}
                    </SelectGroup>
                  ))}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="payment_method_sat"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Método SAT</FormLabel>
              <Select value={(field.value as string) ?? ""} onValueChange={field.onChange}>
                <FormControl><SelectTrigger><SelectValue placeholder="Opcional" /></SelectTrigger></FormControl>
                <SelectContent>
                  {PAYMENT_METHOD_SAT_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <DateField control={form.control} name="issue_date" label="Fecha emisión" required />
        <div className="space-y-1">
          <DateField control={form.control} name="due_date" label="Vencimiento" />
          {suggestedDueDate && selectedSupplier?.default_payment_terms_days != null && (
            <p className="text-xs text-muted-foreground">
              Sugerido: {formatDateDisplay(toYMD(suggestedDueDate) ?? "")} (proveedor a {selectedSupplier.default_payment_terms_days} días)
            </p>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <DateField control={form.control} name="coverage_start" label="Cobertura desde" />
        <div className="space-y-1">
          <DateField control={form.control} name="coverage_end" label="Cobertura hasta" />
          <p className="text-xs text-muted-foreground">
            Opcional. Si aplica (p. ej. seguros anuales), el gasto se prorratea por días entre los meses del periodo.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <FormField
          control={form.control}
          name="currency"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Moneda</FormLabel>
              <Select value={field.value as string} onValueChange={field.onChange}>
                <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                <SelectContent>
                  {currencyOptions.map((c) => (
                    <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormItem>
          )}
        />
        <NumberField control={form.control} name="exchange_rate" label="Tipo de cambio" step={0.0001} nullOnEmpty={false} />
        <TextField control={form.control} name="cfdi_uuid" label="UUID fiscal" placeholder="Opcional" />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <CurrencyField control={form.control} name="subtotal" label="Subtotal" required currency={currency as "MXN" | "USD"} />
        <CurrencyField control={form.control} name="tax_amount" label="IVA" currency={currency as "MXN" | "USD"} />
        <CurrencyField control={form.control} name="retention_iva" label="Retención IVA" currency={currency as "MXN" | "USD"} />
        <CurrencyField control={form.control} name="retention_isr" label="Retención ISR" currency={currency as "MXN" | "USD"} />

      </div>
    </>
  );
}
