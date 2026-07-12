import { useFieldArray, type UseFormReturn } from "react-hook-form";
import { lineItemTotal } from "@/lib/domain/invoiceHelpers";
import {
  type InvoiceFormValues,
  type LineItemValues,
  EMPTY_LINE,
} from "../../lib/invoiceFormSchema";

export function useInvoiceLineItemHandlers(form: UseFormReturn<InvoiceFormValues>) {
  const { fields, append, remove, update } = useFieldArray({
    control: form.control, name: "lineItems",
  });

  const updateLineItem = (index: number, field: string, value: string | number) => {
    const current = form.getValues(`lineItems.${index}`);
    const next: LineItemValues = { ...current, [field]: value };
    if (field === "quantity" || field === "unit_price") {
      next.total = lineItemTotal(Number(next.quantity), Number(next.unit_price));
    }
    update(index, next);
  };

  const addLineItem = () => append({ ...EMPTY_LINE });
  const removeLineItem = (index: number) => remove(index);

  return { fields, updateLineItem, addLineItem, removeLineItem };
}
