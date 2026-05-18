import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/StatusBadge";
import { formatDateDisplay, formatDateRange } from "@/lib/utils";
import { formatCurrency } from "@/lib/formatCurrency";

interface Booking {
  id: string;
  status: string;
  start_date: string;
  end_date: string;
  forklifts?: { name?: string | null; model?: string | null } | null;
}

interface Invoice {
  id: string;
  invoice_number: string | null;
  issued_at: string | null;
  total: number | string;
  status: string;
}

export function PortalBookingsCard({ bookings }: { bookings: Booking[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Rentas Actuales</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {bookings.map((b) => (
          <div key={b.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/40 text-sm">
            <div>
              <p className="font-medium">{b.forklifts?.name || "—"} — {b.forklifts?.model || ""}</p>
              <p className="text-xs text-muted-foreground">{formatDateRange(b.start_date, b.end_date)}</p>
            </div>
            <StatusBadge status={b.status} />
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

export function PortalRecentInvoicesCard({ invoices }: { invoices: Invoice[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Facturas Recientes</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {invoices.map((inv) => (
          <div key={inv.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/40 text-sm">
            <div>
              <p className="font-medium">{inv.invoice_number}</p>
              <p className="text-xs text-muted-foreground">{formatDateDisplay(inv.issued_at)}</p>
            </div>
            <div className="flex items-center gap-3">
              <span className="font-mono font-semibold">{formatCurrency(Number(inv.total))}</span>
              <StatusBadge status={inv.status} />
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
