import { FormControl, FormField, FormItem, FormMessage } from "@/components/ui/form";
import { CustomerSelector, type Customer } from "@/features/customers";
import type { QuoteFormValues } from "../../lib/quoteFormSchema";
import type { UseFormReturn } from "react-hook-form";

type QuoteForm = UseFormReturn<QuoteFormValues>;

interface Props {
  form: QuoteForm;
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
              compact
              helpText={customers.some((customer) => customer.name === "Público en General")
                ? "Si tu cliente no aparece, selecciona 'Público en General' o regístralo en Clientes."
                : "Si tu cliente no aparece, regístralo primero en Clientes."}
            />
          </FormControl>
          <FormMessage />
        </FormItem>
      )}
    />
  );
}
