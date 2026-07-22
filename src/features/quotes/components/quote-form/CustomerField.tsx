import type { UseFormReturn } from "react-hook-form";
import { FormControl, FormField, FormItem, FormMessage } from "@/components/ui/form";
import { CustomerSelector, type Customer } from "@/features/customers";

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- form es genérico QuoteFormValues
type AnyForm = UseFormReturn<any>;

interface Props {
  form: AnyForm;
  customers: Customer[];
}

export function CustomerField({ form, customers }: Props) {
  return (
    <FormField
      control={form.control}
      name="customerId"
      render={({ field }) => (
        <FormItem>
          <FormControl>
            <CustomerSelector
              customers={customers}
              customerId={field.value}
              customerName={form.getValues("customerName")}
              onCustomerIdChange={field.onChange}
              onCustomerNameChange={(name) => form.setValue("customerName", name, { shouldDirty: true })}
              required
              hideManualName
              helpText="Si tu cliente no aparece en la lista, selecciona 'Público en General' o regístralo primero en el módulo de Clientes."
            />
          </FormControl>
          <FormMessage />
        </FormItem>
      )}
    />
  );
}
