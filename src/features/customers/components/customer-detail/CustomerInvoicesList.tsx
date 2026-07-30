
import { StatusBadge } from "@/components/feedback/StatusBadge";
import { InvoiceIcon } from "@/components/icons";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getAccessLevel, useRolePermissions, useUserRole } from "@/features/users";
import { useNavigateTransition } from "@/hooks/useNavigateTransition";
import { formatCurrency } from "@/lib/format/formatCurrency";
import { formatDateDisplay } from "@/lib/utils";

interface InvoiceRow {
  id: string;
  invoice_number: string;
  status: string;
  total: number | string;
  issued_at: string;
  due_date?: string | null;
}

export function CustomerInvoicesList({ invoices }: { invoices: InvoiceRow[] }) {
  const navigate = useNavigateTransition();
  // R6-FE-04a (N6-VEN-02): ventas (Facturas=none) veía folios que navegaban
  // a /invoices/:id → pantalla "Sin permisos". Facturas=none: se oculta la
  // sección; Facturas=read: folio como texto plano sin enlace.
  const { data: role } = useUserRole();
  const { data: perms } = useRolePermissions();
  const invoicesAccess = getAccessLevel(perms, role ?? undefined, "Facturas");
  if (perms && invoicesAccess === "none") return null;
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
                      onClick: () => navigate(`/invoices/${inv.id}`),
                      onKeyDown: (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); navigate(`/invoices/${inv.id}`); } },
                    }
                  : {})}
                className={`flex items-center justify-between p-3 rounded-lg bg-muted/40 text-sm ${canOpenInvoice ? "cursor-pointer hover:bg-muted/60" : ""}`}
              >
                <div>
                  <p className="font-medium">{inv.invoice_number}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatDateDisplay(inv.issued_at)}
                    {inv.due_date ? ` — Vence: ${formatDateDisplay(inv.due_date)}` : ""}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-mono font-semibold">{formatCurrency(Number(inv.total))}</span>
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
