import { useRef } from "react";
import { useFieldArray, type UseFormReturn } from "react-hook-form";
import { lineItemTotal } from "@/lib/domain/invoiceHelpers";
import {
  type InvoiceFormValues,
  type LineItemValues,
  EMPTY_LINE,
} from "../../lib/invoiceFormSchema";
import { hasSaleLines, hasSatSelectionRequiredLines, isSaleInvoiceSource, lineSourceQuoteIds, requiresExplicitInvoiceSat, type InvoiceLineItemSource } from "./invoiceSatDefaults";

export function useInvoiceLineItemHandlers(form: UseFormReturn<InvoiceFormValues>, source: InvoiceLineItemSource = {}) {
  const { fields, append, remove, update } = useFieldArray({
    control: form.control, name: "lineItems",
  });
  const sourceContext = useRef({ key: source.key, hasSale: false, requiresSat: false, quoteIds: [] as string[] });

  // Read/write only in event handlers. Capture BEFORE removal, including a
  // remove + add in the same event, and scope the memory to the current source.
  const rememberSourceContext = () => {
    const lines = form.getValues("lineItems");
    const previous = sourceContext.current.key === source.key ? sourceContext.current : undefined;
    sourceContext.current = {
      key: source.key,
      hasSale: isSaleInvoiceSource(source) || hasSaleLines(lines) || !!previous?.hasSale,
      requiresSat: hasSatSelectionRequiredLines(lines) || hasSatSelectionRequiredLines(source.originalLines) || !!previous?.requiresSat,
      quoteIds: [...new Set([...lineSourceQuoteIds(lines), ...(previous?.quoteIds ?? [])])],
    };
    return sourceContext.current;
  };

  const updateLineItem = (index: number, field: string, value: string | number) => {
    rememberSourceContext();
    const current = form.getValues(`lineItems.${index}`);
    const next: LineItemValues = { ...current, [field]: value };
    if (field === "quantity" || field === "unit_price") {
      next.total = lineItemTotal(Number(next.quantity), Number(next.unit_price));
    }
    update(index, next);
  };

  const addLineItem = () => {
    const { hasSale, requiresSat, quoteIds } = rememberSourceContext();
    const line = { ...EMPTY_LINE };
    if (requiresSat || requiresExplicitInvoiceSat(source, hasSale, quoteIds)) {
      line.clave_prod_serv = "";
      line.clave_unidad = "";
      line.sat_selection_required = true;
      sourceContext.current.requiresSat = true;
    }
    if (hasSale) line.line_kind = "sale";
    append(line);
  };
  const removeLineItem = (index: number) => {
    rememberSourceContext();
    remove(index);
  };

  return { fields, updateLineItem, addLineItem, removeLineItem };
}
