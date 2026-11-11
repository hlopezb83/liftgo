
import { useWatch, type UseFormReturn } from "react-hook-form";
import { computeTotals } from "@/lib/domain/invoiceHelpers";
import type { InvoiceFormValues } from "../../lib/invoiceFormSchema";

export function useInvoiceFormTotals(form: UseFormReturn<InvoiceFormValues>) {
  return useWatch({
    control: form.control,
    name: ["lineItems", "taxRate"] as const,
    compute: ([lines, taxRate]) => {
      const items = (lines ?? []).map((line) => ({
        description: line?.description ?? "",
        quantity: Number(line?.quantity ?? 0),
        unit_price: Number(line?.unit_price ?? 0),
        total: Number(line?.total ?? 0),
        discount: line?.discount,
        discount_type: line?.discount_type,
        objeto_imp: line?.objeto_imp,
        tax_rate: line?.tax_rate,
      }));
      return computeTotals(items, Number(taxRate ?? 0));
    },
  });
}
