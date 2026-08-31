import { Link } from "react-router";
import { StatusBadge } from "@/components/feedback/StatusBadge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDateMty } from "@/lib/format/dateFormats";
import { formatCurrencyWithCode } from "@/lib/format/formatCurrency";
import { formatDateRange } from "@/lib/utils";

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
  moneda?: string | null;
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

/**
 * F4: la lista se recorta a 5; si hay más facturas se muestra un enlace a la
 * lista completa para que el cliente no crea que esas son todas.
 */
export function PortalRecentInvoicesCard({
  invoices,
  totalCount,
}: { invoices: Invoice[]; totalCount?: number }) {
  const total = totalCount ?? invoices.length;
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
              <p className="text-xs text-muted-foreground">{formatDateMty(inv.issued_at)}</p>
            </div>
            <div className="flex items-center gap-3">
              {/* Auditoría R19: mostrar código de moneda para no confundir USD con MXN. */}
              <span className="font-mono font-semibold">
                {formatCurrencyWithCode(Number(inv.total), inv.moneda ?? "MXN")}
              </span>
              <StatusBadge status={inv.status} />
            </div>
          </div>
        ))}
        {total > invoices.length ? (
          <Link to="/portal/invoices" className="block pt-1 text-sm text-primary hover:underline">
            Ver todas ({total})
          </Link>
        ) : null}
      </CardContent>

    </Card>
  );
}
