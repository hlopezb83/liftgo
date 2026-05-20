import currency from "currency.js";
import { useCallback } from "react";
import { useFieldArray, type UseFormReturn } from "react-hook-form";
import {
  type InvoiceFormValues,
  type LineItemValues,
  type CfdiFormValues,
  EMPTY_LINE,
} from "@/lib/schemas/invoiceFormSchema";

export function useInvoiceLineItemHandlers(form: UseFormReturn<InvoiceFormValues>) {
  const { fields, append, remove, update } = useFieldArray({
    control: form.control, name: "lineItems",
  });

  const updateLineItem = useCallback((index: number, field: string, value: string | number) => {
    const current = form.getValues(`lineItems.${index}`);
    const next: LineItemValues = { ...current, [field]: value } as LineItemValues;
    if (field === "quantity" || field === "unit_price") {
      next.total = currency(Number(next.unit_price)).multiply(Number(next.quantity)).value;
    }
    update(index, next);
  }, [form, update]);

  const addLineItem = useCallback(() => append({ ...EMPTY_LINE }), [append]);
  const removeLineItem = useCallback((index: number) => remove(index), [remove]);

  const handleCfdiUpdate = useCallback(<K extends keyof CfdiFormValues>(field: K, value: CfdiFormValues[K]) => {
    form.setValue(`cfdi.${field}`, value, { shouldDirty: true });
    if (field === "moneda" && value === "MXN") {
      form.setValue("cfdi.tipoCambio", 1, { shouldDirty: true });
    }
  }, [form]);

  return { fields, updateLineItem, addLineItem, removeLineItem, handleCfdiUpdate };
}
