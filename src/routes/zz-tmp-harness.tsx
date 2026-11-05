import { createFileRoute } from "@tanstack/react-router";
import { InvoiceSourceLinks } from "@/features/invoices/components/invoice-detail/InvoiceSourceLinks";
const b = (id: string, n: string | null, f: string | null) => ({ id, booking_number: n, start_date: "2026-01-01", end_date: "2026-03-31", forklifts: f ? { name: f } : null }) as never;
export const Route = createFileRoute("/zz-tmp-harness")({ component: () => (
  <div className="p-4 space-y-4" data-testid="h">
    <InvoiceSourceLinks sourceQuote={{ id: "q1", quote_number: "COT-0001" }} sourceBooking={b("f94fee07-cdcf-404b-8fd7-2b660de31849", "RSV-0006", "MCAPC025A048/003")} />
    <InvoiceSourceLinks sourceBookings={[b("b1", "RSV-0007", "MONTACARGAS-ELECTRICO-CONTRAPESO-MODELO-EXTRA-LARGO-SIN-ESPACIOS-0001/ABC"), b("b2", null, null), b("b3", "RSV-0009", "Equipo con nombre muy largo para revisar ajuste de línea en móvil")]} />
  </div>) });
