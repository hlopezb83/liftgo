
import { StatusBadge } from "@/components/feedback/StatusBadge";
import { InvoiceIcon } from "@/components/icons";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getAccessLevel, useRolePermissions, useUserRole } from "@/features/users";
import { useNavigateTransition } from "@/hooks/useNavigateTransition";
import { formatDateMty } from "@/lib/format/dateFormats";
import { formatCurrencyWithCode } from "@/lib/format/formatCurrency";
import { getCustomerListBackTo } from "@/lib/navigation/customerInvoiceOrigins";
import { useLocation } from "@/lib/router-compat";

interface InvoiceRow {
  id: string;
  invoice_number: string;
  status: string;
  total: number | string;
  issued_at: string;
  due_date?: string | null;
  currency?: string | null;
}

export function CustomerInvoicesList({ invoices }: { invoices: InvoiceRow[] }) {
  const navigate = useNavigateTransition();
  const location = useLocation();
  const openInvoice = (id: string) => {
    const customerListBackTo = getCustomerListBackTo(location.state);
    navigate(`/invoices/${id}`, {
      state: {
        customerInvoiceBackTo: `${location.pathname}${location.search}${location.hash}`,
        ...(customerListBackTo ? { customerListBackTo } : {}),
      },
    });
  };
  // R6-FE-04a (N6-VEN-02): ventas (Facturas=none) veía folios que navegaban
  // a /invoices/:id → pantalla "Sin permisos". Facturas=none: se oculta la
  // sección; Facturas=read: folio como texto plano sin enlace.
  const { data: role } = useUserRole();
  const { data: perms } = useRolePermissions();
  const invoicesAccess = getAccessLevel(perms, role ?? undefined, "Facturas");
  if (invoicesAccess === "none") return null;
  const canOpenInvoice = invoicesAccess === "full";
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <InvoiceIcon className="h-4 w-4" /> Facturas
        </CardTitle>
      </CardHeader>
      <CardContent>
        {invoices.length > 0 ? (
          <div className="space-y-2">
            {invoices.map((inv) => (
              <div
                key={inv.id}
                {...(canOpenInvoice
                  ? {
                      role: "button",
                      tabIndex: 0,
                      onClick: () => openInvoice(inv.id),
                      onKeyDown: (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openInvoice(inv.id); } },
                    }
                  : {})}
                className={`flex flex-col gap-3 rounded-lg bg-muted/40 p-3 text-sm sm:flex-row sm:items-center sm:justify-between ${canOpenInvoice ? "cursor-pointer hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2" : ""}`}
              >
                <div className="min-w-0 space-y-1 sm:flex-1">
                  <p className="break-words font-medium [overflow-wrap:anywhere]">{inv.invoice_number}</p>
                  <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    <span>Emisión: {formatDateMty(inv.issued_at)}</span>
                    {inv.due_date && <span>Vence: {formatDateMty(inv.due_date)}</span>}
                  </div>
                </div>
                <div className="flex w-full flex-wrap items-center justify-between gap-x-3 gap-y-2 sm:w-auto sm:justify-end">
                  <div className="min-w-0">
                    <p className="mb-0.5 text-xs text-muted-foreground sm:text-right">Total</p>
                    <p className="flex flex-wrap items-baseline gap-x-1.5">
                      <span className="break-words font-mono font-semibold tabular-nums [overflow-wrap:anywhere]">{formatCurrencyWithCode(Number(inv.total), inv.currency ?? "MXN")}</span>
                      <span className="text-xs text-muted-foreground">{inv.currency ?? "MXN"}</span>
                    </p>
                  </div>
                  <StatusBadge status={inv.status} />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground text-center py-6">Sin facturas aún</p>
        )}
      </CardContent>
    </Card>
  );
}
