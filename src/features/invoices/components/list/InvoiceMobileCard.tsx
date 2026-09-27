import { StatusBadge } from "@/components/feedback/StatusBadge";
import { ChevronRightIcon } from "@/components/icons";
import { Card, CardContent } from "@/components/ui/card";
import { Untranslated } from "@/components/ui/Untranslated";
import type { Tables } from "@/integrations/supabase/types";
import { formatDateMty } from "@/lib/format/dateFormats";
import { formatCurrency } from "@/lib/format/formatCurrency";
import { Link } from "@/lib/router-compat-ui";

export type InvoiceCardItem = Pick<Tables<"invoices">, "id" | "invoice_number" | "customer_name" | "status" | "issued_at" | "due_date" | "total" | "moneda">;

export function InvoiceMobileCard({ inv }: { inv: InvoiceCardItem }) {
  const moneda = inv.moneda ?? "MXN";
  return (
    <Link
      to={`/invoices/${inv.id}`}
      aria-label={`Ver factura ${inv.invoice_number}${inv.customer_name ? ` de ${inv.customer_name}` : ""}`}
      className="block rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
    >
      <Card className="active:scale-[0.98] transition-transform">
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-1">
            <Untranslated className="font-mono font-semibold text-sm">{inv.invoice_number}</Untranslated>
            <StatusBadge status={inv.status} />
          </div>
          <p className="text-sm text-muted-foreground">
            {inv.customer_name ? <Untranslated>{inv.customer_name}</Untranslated> : "Sin cliente"}
          </p>
          <div className="flex items-center justify-between mt-3 pt-3 border-t">
            <div className="text-xs text-muted-foreground">
              <span>{formatDateMty(inv.issued_at)}</span>
              {inv.due_date && <span> → {formatDateMty(inv.due_date)}</span>}
            </div>
            <div className="flex items-center gap-1">
              <span className="text-sm font-semibold tabular-nums">{formatCurrency(Number(inv.total))}</span>
              {moneda !== "MXN" && (
                <span className="text-[10px] font-medium text-muted-foreground bg-muted px-1 rounded">{moneda}</span>
              )}
              <ChevronRightIcon className="h-4 w-4 text-muted-foreground" />
            </div>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

