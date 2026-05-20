import { useMemo } from "react";
import { useWatch, type UseFormReturn } from "react-hook-form";
import type { InvoiceFormValues } from "@/lib/schemas/invoiceFormSchema";
import { computeTotals } from "@/features/invoices/lib/invoiceHelpers";

export function useInvoiceFormTotals(form: UseFormReturn<InvoiceFormValues>) {
  const watched = useWatch({ control: form.control, name: ["lineItems", "taxRate"] });
  return useMemo(() => {
    const items = (watched[0] ?? []).map((i) => ({
      description: i?.description ?? "",
      quantity: Number(i?.quantity ?? 0),
      unit_price: Number(i?.unit_price ?? 0),
      total: Number(i?.total ?? 0),
      discount: i?.discount,
      discount_type: i?.discount_type,
    }));
    return computeTotals(items, Number(watched[1] ?? 0));
  }, [watched]);
}
