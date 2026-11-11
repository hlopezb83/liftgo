import { StatusBadge } from "@/components/feedback/StatusBadge";
import { invoiceFiscalStatus, INVOICE_FISCAL_LABELS, type FiscalStatusFields, type InvoiceFiscalStatus } from "../lib/invoiceFiscalStatus";

type Tone = "neutral" | "success" | "warning" | "destructive";
const toneStatus: Record<Tone, string> = {
  neutral: "draft", success: "paid", warning: "pending", destructive: "error",
};

const fiscalTone: Record<InvoiceFiscalStatus, Tone> = {
  pending: "warning", stamping: "warning", stamped: "success", error: "destructive",
  cancellation_pending: "warning", cancelled: "destructive", unknown: "neutral",
};

export function InvoiceFiscalBadge(props: FiscalStatusFields) {
  const status = invoiceFiscalStatus(props);
  const tone = fiscalTone[status];
  return (
    <div data-tone={tone} className="inline-flex">
      <StatusBadge status={status === "cancelled" ? "cancelled" : toneStatus[tone]} label={INVOICE_FISCAL_LABELS[status]} />
    </div>
  );
}

export function InvoiceStatusBadges({ invoiceStatus, ...fiscal }: FiscalStatusFields & { invoiceStatus: string }) {
  return (
    <div className="inline-flex flex-wrap items-center gap-x-3 gap-y-2">
      <div role="group" aria-label="Cobro" className="inline-flex flex-wrap items-center gap-1.5">
        <span className="text-xs text-muted-foreground">Cobro:</span>
        <StatusBadge status={invoiceStatus} />
      </div>
      <div role="group" aria-label="CFDI" className="inline-flex flex-wrap items-center gap-1.5">
        <span className="text-xs text-muted-foreground">CFDI:</span>
        <InvoiceFiscalBadge {...fiscal} />
      </div>
    </div>
  );
}
