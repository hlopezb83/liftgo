import { createContext, useContext, useMemo, type PropsWithChildren } from "react";
import { useFormContext, useFormState, useWatch } from "react-hook-form";
import { TotalsSummary } from "@/components/domain/TotalsSummary";
import { formatCurrencyWithCode } from "@/lib/format/formatCurrency";
import { useInvoiceFormTotals } from "../../hooks/invoiceForm/useInvoiceFormTotals";
import type { InvoiceFormValues } from "../../lib/invoiceFormSchema";

type Totals = ReturnType<typeof useInvoiceFormTotals> & { currency?: string; taxRate: number };
const TotalsContext = createContext<Totals | null>(null);

function useTotals() {
  const totals = useContext(TotalsContext);
  if (!totals) throw new Error("Invoice totals require an InvoiceTotalsProvider");
  return totals;
}

export function InvoiceTotalsProvider({ children }: PropsWithChildren) {
  const form = useFormContext<InvoiceFormValues>();
  const totals = useInvoiceFormTotals(form);
  const [currency, taxRate] = useWatch({ control: form.control, name: ["cfdi.moneda", "taxRate"] });
  const value = useMemo(() => ({ ...totals, currency, taxRate }), [totals, currency, taxRate]);
  return <TotalsContext value={value}>{children}</TotalsContext>;
}

export function InvoiceTotalsSummary() {
  const { control, setValue } = useFormContext<InvoiceFormValues>();
  const { errors } = useFormState({ control, name: "taxRate", exact: true });
  const totals = useTotals();
  return (
    <aside aria-label="Resumen de importes" className="min-w-0 space-y-3 xl:sticky xl:top-20">
      <h2 className="text-base font-semibold">Resumen de importes</h2>
      <TotalsSummary {...totals} onTaxRateChange={(value) => setValue("taxRate", value, { shouldDirty: true })} />
      {errors.taxRate?.message && <p role="alert" className="text-sm text-destructive">{errors.taxRate.message}</p>}
    </aside>
  );
}

export function InvoiceStickySubmitBar({ children }: PropsWithChildren) {
  const { total, currency } = useTotals();
  return (
    <div className="sticky bottom-0 z-10 flex flex-col gap-3 rounded-t-lg border-t bg-background/95 py-3 backdrop-blur sm:flex-row sm:items-center sm:justify-between">
      <p className="text-sm text-muted-foreground">
        Total <span className="ml-1 font-mono text-base font-semibold text-foreground">{formatCurrencyWithCode(total, currency)}</span>
      </p>
      {children}
    </div>
  );
}
