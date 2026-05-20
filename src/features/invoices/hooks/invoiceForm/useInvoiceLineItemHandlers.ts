import currency from "currency.js";
import { useCallback } from "react";
import { useFieldArray, type UseFormReturn } from "react-hook-form";
import {
  type InvoiceFormValues,
  type LineItemValues,
  EMPTY_LINE,
} from "@/lib/schemas/invoiceFormSchema";

export function useInvoiceLineItemHandlers(form: UseFormReturn<InvoiceFormValues>) {
  const { fields, append, remove, update } = useFieldArray({
    control: form.control, name: "lineItems",
  });

  const updateLineItem = useCallback((index: number, field: string, value: string | number) => {
    const current = form.getValues(`lineItems.${index}`);
    const next: LineItemValues = { ...current, [field]: value };
    if (field === "quantity" || field === "unit_price") {
      next.total = currency(Number(next.unit_price)).multiply(Number(next.quantity)).value;
    }
    update(index, next);
  }, [form, update]);

  const addLineItem = useCallback(() => append({ ...EMPTY_LINE }), [append]);
  const removeLineItem = useCallback((index: number) => remove(index), [remove]);

  return { fields, updateLineItem, addLineItem, removeLineItem };
}
