import { useState } from "react";
import { useParams } from "react-router-dom";
import { StatusBadge } from "@/components/feedback/StatusBadge";
import { PageContainer } from "@/components/layout/PageContainer";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  usePortalInvoices,
  usePortalPayments,
  usePortalCustomer,
} from "@/features/customers";
import { formatCurrency } from "@/lib/format/formatCurrency";
import { formatDateDisplay } from "@/lib/utils";
import { ReportTransferDialog } from "../components/ReportTransferDialog";
import { StpTransferCard } from "../components/StpTransferCard";
import { usePortalPaymentIntents } from "../hooks/usePortalExtras";

export default function PortalInvoicePayment() {
  const { id } = useParams();
  const { data: invoices, isLoading: il } = usePortalInvoices();
  const { data: payments, isLoading: pl } = usePortalPayments();
  const { data: customer } = usePortalCustomer();
  const { data: intents } = usePortalPaymentIntents(id);
  const [dlgOpen, setDlgOpen] = useState(false);

  const invoice = invoices?.find((i) => i.id === id);
  const invoicePayments = (payments?.filter((p) => p.invoice_id === id) ?? []);

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
    <PageContainer maxWidth="wide">
      <PageHeader
        title={`Pagar ${invoice.invoice_number}`}
        backHref={`/portal/invoices/${invoice.id}`}
        backLabel="Factura"
      />
      <div className="-mt-2 flex items-center gap-2 text-sm text-muted-foreground">
        <StatusBadge status={invoice.status} />
        <span>Saldo: <span className="font-mono">{formatCurrency(balance)}</span></span>
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
    </PageContainer>
  );
}
