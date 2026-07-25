import { useState } from "react";
import { useParams } from "react-router";
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
import { formatCurrency, formatCurrencyWithCode } from "@/lib/format/formatCurrency";
import { formatDateDisplay } from "@/lib/utils";
import { ReportTransferDialog } from "../components/ReportTransferDialog";
import { StpTransferCard } from "../components/StpTransferCard";
import { usePortalPaymentIntents } from "../hooks/usePortalExtras";

type Intent = { id: string; transfer_date: string; amount: number | string; tracking_key: string | null; status: string };

const intentStatusLabel = (s: string) =>
  s === "pending_review" ? "En revisión" : s === "approved" ? "Aprobado" : "Rechazado";

function PortalIntentsTable({ intents }: { intents: Intent[] }) {
  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Reportes anteriores</CardTitle></CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
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
                  <td className="px-3 py-2">{intentStatusLabel(i.status)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

function ForeignCurrencyNotice({ moneda, balanceLabel }: { moneda: string; balanceLabel: string }) {
  return (
    <Card>
      <CardContent className="pt-6 space-y-1">
        <p className="text-sm font-medium">Esta factura es en {moneda}.</p>
        <p className="text-sm text-muted-foreground">
          El saldo es {balanceLabel}. Por ahora los pagos en {moneda} se
          coordinan con tu ejecutivo de cuenta; la transferencia SPEI en
          pesos no aplica para esta factura.
        </p>
      </CardContent>
    </Card>
  );
}

function MxnPaymentSection({ balance, concept, pendingReported, canReport, onReport }: {
  balance: number;
  concept: string;
  pendingReported: number;
  canReport: boolean;
  onReport: () => void;
}) {
  return (
    <>
      <StpTransferCard amount={balance} concept={concept} />
      <div className="flex gap-2">
        <Button onClick={onReport} disabled={!canReport}>
          Ya transferí — reportar pago
        </Button>
        {pendingReported > 0 && (
          <p className="text-xs text-muted-foreground self-center">
            Tienes {formatCurrency(pendingReported)} en revisión.
          </p>
        )}
      </div>
    </>
  );
}

function PaidCard() {
  return (
    <Card>
      <CardContent className="pt-6">
        <p className="text-sm">Esta factura ya está pagada. ¡Gracias!</p>
      </CardContent>
    </Card>
  );
}

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
  const balance = invoice.balance != null
    ? Number(invoice.balance)
    : Math.max(0, Number(invoice.total) - totalPaid - Number(invoice.credited_amount ?? 0));
  const concept = `${invoice.invoice_number}`;
  // R14-E: la página ignoraba la moneda. SPEI (CLABE MXN) sólo aplica a
  // facturas en pesos — para USD el trigger trg_payments_currency_matches_invoice
  // rechazaría el pago en MXN.
  const moneda = (invoice as { moneda?: string | null }).moneda ?? "MXN";
  const isMxn = moneda === "MXN";
  const balanceLabel = formatCurrencyWithCode(balance, moneda);

  let paymentSection;
  if (balance <= 0) {
    paymentSection = <PaidCard />;
  } else if (isMxn) {
    paymentSection = (
      <MxnPaymentSection
        balance={balance}
        concept={concept}
        pendingReported={pendingReported}
        canReport={!!customer}
        onReport={() => setDlgOpen(true)}
      />
    );
  } else {
    paymentSection = <ForeignCurrencyNotice moneda={moneda} balanceLabel={balanceLabel} />;
  }

  return (
    <PageContainer maxWidth="wide">
      <PageHeader
        title={`Pagar ${invoice.invoice_number}`}
        backHref={`/portal/invoices/${invoice.id}`}
        backLabel="Factura"
      />
      <div className="-mt-2 flex items-center gap-2 text-sm text-muted-foreground">
        <StatusBadge status={invoice.status} />
        <span>Saldo: <span className="font-mono">{balanceLabel}</span></span>
      </div>

      {paymentSection}

      {!!intents?.length && <PortalIntentsTable intents={intents as Intent[]} />}

      {customer && isMxn && (
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
