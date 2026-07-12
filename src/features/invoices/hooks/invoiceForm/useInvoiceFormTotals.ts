
import { useWatch, type UseFormReturn } from "react-hook-form";
import type { InvoiceFormValues } from "../../lib/invoiceFormSchema";
import { computeTotals } from "@/lib/domain/invoiceHelpers";

export function useInvoiceFormTotals(form: UseFormReturn<InvoiceFormValues>) {
  const watched = useWatch({ control: form.control, name: ["lineItems", "taxRate"] });
  return (() => {
    const items = (watched[0] ?? []).map((i) => ({
      description: i?.description ?? "",
      quantity: Number(i?.quantity ?? 0),
      unit_price: Number(i?.unit_price ?? 0),
      total: Number(i?.total ?? 0),
      discount: i?.discount,
      discount_type: i?.discount_type,
    }));
    return computeTotals(items, Number(watched[1] ?? 0));
  })();
}
