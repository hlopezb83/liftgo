import { useMemo, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/feedback/StatusBadge";
import { ArrowLeft } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCurrency } from "@/lib/format/formatCurrency";
import { formatDateDisplay } from "@/lib/utils";
import {
  usePortalInvoices,
  usePortalPayments,
  usePortalCustomer,
} from "@/features/customers/hooks/customers/useCustomerPortal";
import { usePortalPaymentIntents } from "@/features/portal/hooks/usePortalExtras";
import { StpTransferCard } from "@/features/portal/components/StpTransferCard";
import { ReportTransferDialog } from "@/features/portal/components/ReportTransferDialog";

export default function PortalInvoicePayment() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { data: invoices, isLoading: il } = usePortalInvoices();
  const { data: payments, isLoading: pl } = usePortalPayments();
  const { data: customer } = usePortalCustomer();
  const { data: intents } = usePortalPaymentIntents(id);
  const [dlgOpen, setDlgOpen] = useState(false);

  const invoice = invoices?.find((i) => i.id === id);
  const invoicePayments = useMemo(
    () => (payments?.filter((p) => p.invoice_id === id) ?? []),
    [payments, id],
  );

  if (il || pl) return <Skeleton className="h-96" />;
  if (!invoice) return <p className="text-muted-foreground">Factura no encontrada</p>;

  const totalPaid = invoicePayments.reduce((s, p) => s + Number(p.amount), 0);
  const pendingReported = (intents ?? [])
    .filter((i) => i.status === "pending_review")
    .reduce((s, i) => s + Number(i.amount), 0);
  const balance = Number(invoice.total) - totalPaid;
  const concept = `${invoice.invoice_number}`;

  const statusLabel = (s: string) =>
    s === "pending_review" ? "En revisión" : s === "approved" ? "Aprobado" : "Rechazado";

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate(`/portal/invoices/${invoice.id}`)}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold">Pagar {invoice.invoice_number}</h1>
          <div className="flex items-center gap-2 mt-1">
            <StatusBadge status={invoice.status} />
            <span className="text-sm text-muted-foreground">
              Saldo: <span className="font-mono">{formatCurrency(balance)}</span>
            </span>
          </div>
        </div>
      </div>

      {balance <= 0 ? (
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm">Esta factura ya está pagada. ¡Gracias!</p>
          </CardContent>
        </Card>
      ) : (
        <>
          <StpTransferCard amount={balance} concept={concept} />

          <div className="flex gap-2">
            <Button onClick={() => setDlgOpen(true)} disabled={!customer}>
              Ya transferí — reportar pago
            </Button>
            {pendingReported > 0 && (
              <p className="text-xs text-muted-foreground self-center">
                Tienes {formatCurrency(pendingReported)} en revisión.
              </p>
            )}
          </div>
        </>
      )}

      {!!intents?.length && (
        <Card>
          <CardHeader><CardTitle className="text-base">Reportes anteriores</CardTitle></CardHeader>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead className="text-xs text-muted-foreground bg-muted/40">
                <tr>
                  <th className="text-left px-3 py-2">Fecha</th>
                  <th className="text-left px-3 py-2">Monto</th>
                  <th className="text-left px-3 py-2">Rastreo</th>
                  <th className="text-left px-3 py-2">Estado</th>
                </tr>
              </thead>
              <tbody>
                {intents.map((i, idx) => (
                  <tr key={i.id} className={idx % 2 ? "bg-muted/20" : ""}>
                    <td className="px-3 py-2">{formatDateDisplay(i.transfer_date)}</td>
                    <td className="px-3 py-2 font-mono">{formatCurrency(Number(i.amount))}</td>
                    <td className="px-3 py-2 font-mono">{i.tracking_key ?? "—"}</td>
                    <td className="px-3 py-2">{statusLabel(i.status)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      {customer && (
        <ReportTransferDialog
          open={dlgOpen}
          onOpenChange={setDlgOpen}
          invoiceId={invoice.id}
          customerId={customer.id}
          balance={balance}
        />
      )}
    </div>
  );
}
