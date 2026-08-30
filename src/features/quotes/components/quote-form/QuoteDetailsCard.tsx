import { DatePickerField } from "@/components/forms/DatePickerField";
import { DateRangePickerField } from "@/components/forms/DateRangePickerField";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FormControl, FormField, FormItem, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { APP_CONFIG } from "@/lib/config";
import { resolveValidUntil } from "../../hooks/quoteForm/quoteFormPayload";
import type { QuoteFormValues } from "../../lib/quoteFormSchema";
import type { DateRange } from "react-day-picker";
import type { UseFormReturn } from "react-hook-form";

type QuoteForm = UseFormReturn<QuoteFormValues>;

interface Props {
  form: QuoteForm;
  isRental: boolean;
}

export function QuoteDetailsCard({ form, isRental }: Props) {
  // A5-02: sólo hay TC cuando la cotización no es en pesos.
  const currency = form.watch("currency");
  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Detalles de Cotización</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        {isRental && (
          <FormField
            control={form.control}
            name="dateRange"
            render={({ field }) => (
              <FormItem>
                <FormControl>
                  <DateRangePickerField
                    label="Periodo de Renta"
                    dateRange={field.value as DateRange | undefined}
                    onSelect={(v) => {
                      field.onChange(v);
                      // R13-P2-03: el payload coacciona la vigencia a
                      // max(vigencia, fin del periodo). Sin esto el campo
                      // visible quedaba desincronizado con lo que se guarda.
                      const synced = resolveValidUntil(form.getValues("validUntil"), v?.to);
                      if (synced) form.setValue("validUntil", synced, { shouldValidate: true });
                    }}
                    required
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        )}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <FormField
            control={form.control}
            name="currency"
            render={({ field }) => (
              <FormItem className="space-y-1.5">
                <Label>Moneda</Label>
                <Select value={field.value} onValueChange={field.onChange}>
                  <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                  <SelectContent>
                    {APP_CONFIG.CURRENCY_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="taxRate"
            render={({ field }) => (
              <FormItem className="space-y-1.5">
                <Label>IVA</Label>
                <Select value={field.value} onValueChange={field.onChange}>
                  <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                  <SelectContent>
                    {APP_CONFIG.TAX_RATE_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={String(opt.value)}>{opt.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="validUntil"
            render={({ field }) => (
              <FormItem>
                <FormControl>
                  <DatePickerField
                    label="Válida Hasta"
                    date={field.value}
                    onSelect={(d) => field.onChange(d)}
                    placeholder="Seleccionar fecha"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
        {currency !== "MXN" && (
          <FormField
            control={form.control}
            name="tipoCambio"
            render={({ field }) => (
              <FormItem className="space-y-1.5 max-w-xs">
                <Label>Tipo de Cambio (MXN por {currency})</Label>
                <FormControl>
                  <Input
                    type="number"
                    min={0}
                    step="0.0001"
                    placeholder="0.0000"
                    value={field.value || ""}
                    onChange={(e) => field.onChange(Number(e.target.value) || 0)}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        )}
      </CardContent>
    </Card>
  );
}
