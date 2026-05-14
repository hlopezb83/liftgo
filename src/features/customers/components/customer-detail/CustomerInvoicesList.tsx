import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/StatusBadge";
import { Receipt } from "lucide-react";
import { formatCurrency } from "@/lib/formatCurrency";
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
  const navigate = useNavigate();
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Receipt className="h-4 w-4" /> Facturas
        </CardTitle>
      </CardHeader>
      <CardContent>
        {invoices.length > 0 ? (
          <div className="space-y-2">
            {invoices.map((inv) => (
              <div
                key={inv.id}
                className="flex items-center justify-between p-3 rounded-lg bg-muted/40 text-sm cursor-pointer hover:bg-muted/60"
                onClick={() => navigate(`/invoices/${inv.id}`)}
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
