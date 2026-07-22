import type { UseFormReturn } from "react-hook-form";
import type { DateRange } from "react-day-picker";
import { DatePickerField } from "@/components/forms/DatePickerField";
import { DateRangePickerField } from "@/components/forms/DateRangePickerField";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormMessage } from "@/components/ui/form";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { APP_CONFIG } from "@/lib/config";

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- form es genérico QuoteFormValues
type AnyForm = UseFormReturn<any>;

interface Props {
  form: AnyForm;
  isRental: boolean;
}

export function QuoteDetailsCard({ form, isRental }: Props) {
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
                    onSelect={(v) => field.onChange(v)}
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
      </CardContent>
    </Card>
  );
}
