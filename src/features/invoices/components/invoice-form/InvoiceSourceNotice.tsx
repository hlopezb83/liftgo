import { extensionBillableRange } from "@/features/bookings";
import { formatYmdMx } from "../../lib/formatYmdMx";

interface Props {
  extension: { original_end_date: string; new_end_date: string; bookings?: { booking_number?: string | null } | null } | null;
  quoteNumber: string | null;
}

/** Indica de dónde viene la factura (extensión o cotización). Sólo presentación. */
export function InvoiceSourceNotice({ extension, quoteNumber }: Props) {
  let text: string | null = null;
  if (extension) {
    const range = extensionBillableRange(extension.original_end_date, extension.new_end_date);
    const folio = extension.bookings?.booking_number ?? "la reserva";
    text = range
      ? `Facturando la extensión de ${folio} · del ${formatYmdMx(range.start)} al ${formatYmdMx(range.end)} (${range.days} días)`
      : `Facturando la extensión de ${folio}`;
  } else if (quoteNumber) {
    text = `Facturando desde la cotización ${quoteNumber}`;
  }
  if (!text) return null;
  return (
    <div role="status" className="rounded-lg border border-primary/30 bg-primary/5 px-4 py-3 text-sm font-medium text-foreground">
      {text}
    </div>
  );
}
