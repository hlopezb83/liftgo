
import { useWatch, type UseFormReturn } from "react-hook-form";
import { computeTotals } from "@/lib/domain/invoiceHelpers";
import type { InvoiceFormValues } from "../../lib/invoiceFormSchema";

export function useInvoiceFormTotals(form: UseFormReturn<InvoiceFormValues>) {
  const watched = useWatch({ control: form.control, name: ["lineItems", "taxRate"] });
  return (() => {
    // F3 (Sprint M1): incluir `objeto_imp` y `tax_rate` por línea — sin ellos
    // el preview ignora líneas sin IVA ("01") y tasas por línea, mostrando un
    // Total distinto al que `computeTotals` persiste/timbra en el submit.
    const items = (watched[0] ?? []).map((i) => ({
      description: i?.description ?? "",
      quantity: Number(i?.quantity ?? 0),
      unit_price: Number(i?.unit_price ?? 0),
      total: Number(i?.total ?? 0),
      discount: i?.discount,
      discount_type: i?.discount_type,
      objeto_imp: i?.objeto_imp,
      tax_rate: i?.tax_rate,
    }));
    return computeTotals(items, Number(watched[1] ?? 0));
  })();
}
