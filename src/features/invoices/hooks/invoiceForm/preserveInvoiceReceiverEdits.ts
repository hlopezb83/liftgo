import type { InvoiceFormValues } from "../../lib/invoiceFormSchema";
import type { UseFormReturn } from "react-hook-form";

// Booking defaults may replace earlier defaults, never changes made while its
// source data loads. Record edit intent as well as values (including edit/clear).
export function preserveInvoiceReceiverEdits(form: UseFormReturn<InvoiceFormValues>) {
  const values = form.getValues();
  const before = new Map<string, unknown>([
    ["customerId", values.customerId], ["customerName", values.customerName], ["taxRate", values.taxRate],
    ...Object.entries(values.cfdi).map(([key, value]) => [`cfdi.${key}`, value] as const),
  ]);
  const edited = new Set<string>();
  const subscription = form.watch((_values, { name }) => { edited.add(name ?? "*"); });
  const protectedForm: UseFormReturn<InvoiceFormValues> = { ...form, setValue: (name, value, options) => {
    if (!edited.has("*") && !edited.has(name) && !(name.startsWith("cfdi.") && edited.has("cfdi"))
      && before.has(name) && Object.is(form.getValues(name), before.get(name))) {
      form.setValue(name, value, options);
    }
  } };
  return { form: protectedForm, dispose: () => subscription.unsubscribe() };
}
