import type { UseFormReturn } from "react-hook-form";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { FormControl, FormField, FormItem, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- form es genérico QuoteFormValues
type AnyForm = UseFormReturn<any>;

interface Props {
  form: AnyForm;
  includeLogistics: boolean;
}

export function LogisticsCard({ form, includeLogistics }: Props) {
  return (
    <Card>
      <CardContent className="pt-6 space-y-3">
        <FormField
          control={form.control}
          name="includeLogistics"
          render={({ field }) => (
            <FormItem className="flex flex-row items-center gap-2 space-y-0">
              <FormControl>
                <Checkbox
                  id="include-logistics"
                  checked={field.value}
                  onCheckedChange={(checked) => {
                    const on = !!checked;
                    field.onChange(on);
                    if (!on) form.setValue("logisticsCost", 0, { shouldDirty: true });
                  }}
                />
              </FormControl>
              <Label htmlFor="include-logistics" className="cursor-pointer">Incluir Servicio de Logística</Label>
            </FormItem>
          )}
        />
        {includeLogistics && (
          <FormField
            control={form.control}
            name="logisticsCost"
            render={({ field }) => (
              <FormItem className="space-y-1.5 max-w-xs">
                <Label>Monto del Servicio</Label>
                <FormControl>
                  <Input
                    type="number"
                    min={0}
                    step="0.01"
                    placeholder="0.00"
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
