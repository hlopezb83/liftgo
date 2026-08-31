import { useState } from "react";
import { useParams } from "react-router";
import { BlockedActionButton } from "@/components/feedback/BlockedActionButton";
import { BlockedActionNotice } from "@/components/feedback/BlockedActionNotice";
import { QueryErrorState } from "@/components/feedback/QueryErrorState";
import { StatusBadge } from "@/components/feedback/StatusBadge";
import { PageContainer } from "@/components/layout/PageContainer";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  usePortalInvoices,
  usePortalPayments,
  usePortalCustomer,
} from "@/features/customers";
import { formatDateMty } from "@/lib/format/dateFormats";
import { formatCurrency, formatCurrencyWithCode } from "@/lib/format/formatCurrency";
import { describeBusinessBlock, type BusinessBlock } from "@/lib/rules/businessBlocks";
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
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Fecha</TableHead>
              <TableHead>Monto</TableHead>
              <TableHead>Rastreo</TableHead>
              <TableHead>Estado</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {intents.map((i) => (
              <TableRow key={i.id}>
                <TableCell>{formatDateMty(i.transfer_date)}</TableCell>
                <TableCell className="font-mono">{formatCurrency(Number(i.amount))}</TableCell>
                <TableCell
                  className="font-mono max-w-[10rem] truncate"
                  title={i.tracking_key ?? undefined}
                >
                  {i.tracking_key ?? "—"}
                </TableCell>
                <TableCell>{intentStatusLabel(i.status)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
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

function MxnPaymentSection({ balance, concept, pendingReported, canReport, reportBlock, onReport }: {
  balance: number;
  concept: string;
  pendingReported: number;
  canReport: boolean;
  /** Estado de negocio: el saldo reportable ya quedó cubierto por reportes en revisión. */
  reportBlock: BusinessBlock | null;
  onReport: () => void;
}) {
  return (
    <>
      <StpTransferCard amount={balance} concept={concept} />
      <div className="flex gap-2">
        {/* `canReport` cubre la condición técnica (datos del cliente aún no
            disponibles); el bloqueo de negocio se explica aparte. */}
        <BlockedActionButton onClick={onReport} disabled={!canReport} block={reportBlock}>
          Ya transferí — reportar pago
        </BlockedActionButton>
        {pendingReported > 0 && (
          <p className="text-xs text-muted-foreground self-center">
            Tienes {formatCurrency(pendingReported)} en revisión.
          </p>
        )}
      </div>
      {reportBlock && <BlockedActionNotice block={reportBlock} />}
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

type InvoiceLike = { balance?: number | string | null; total: number | string; credited_amount?: number | string | null; moneda?: string | null };

function computeInvoiceTotals(
  invoice: InvoiceLike,
  invoicePayments: { amount: number | string }[],
  intents: { amount: number | string; status: string }[],
) {
  const totalPaid = invoicePayments.reduce((s, p) => s + Number(p.amount), 0);
  const pendingReported = intents
    .filter((i) => i.status === "pending_review")
    .reduce((s, i) => s + Number(i.amount), 0);
  const balance = invoice.balance != null
    ? Number(invoice.balance)
    : Math.max(0, Number(invoice.total) - totalPaid - Number(invoice.credited_amount ?? 0));
  // FIX-FE-04: lo reportable descuenta lo que ya está en revisión; sin esto el
  // cliente podía reportar el saldo completo dos veces (sobrepago al aprobar).
  const reportableBalance = Math.max(0, balance - pendingReported);
  // R14-E: SPEI (CLABE MXN) sólo aplica a facturas en pesos.
  const moneda = invoice.moneda ?? "MXN";
  const isMxn = moneda === "MXN";
  const balanceLabel = formatCurrencyWithCode(balance, moneda);
  return { balance, reportableBalance, pendingReported, moneda, isMxn, balanceLabel };
}

interface PaymentSectionArgs {
  balance: number;
  concept: string;
  pendingReported: number;
  moneda: string;
  isMxn: boolean;
  balanceLabel: string;
  canReport: boolean;
  reportBlock: BusinessBlock | null;
  onReport: () => void;
}

function renderPaymentSection(args: PaymentSectionArgs) {
  if (args.balance <= 0) return <PaidCard />;
  if (args.isMxn) {
    return (
      <MxnPaymentSection
        balance={args.balance}
        concept={args.concept}
        pendingReported={args.pendingReported}
        canReport={args.canReport}
        reportBlock={args.reportBlock}
        onReport={args.onReport}
      />
    );
  }
  return <ForeignCurrencyNotice moneda={args.moneda} balanceLabel={args.balanceLabel} />;
}

function PaymentQueryError({ onRetry }: { onRetry: () => void }) {
  return (
    <PageContainer maxWidth="wide">
      <PageHeader title="Pagar factura" />
      <QueryErrorState entity="la información de pago" onRetry={onRetry} />
    </PageContainer>
  );
}

function InvoiceNotFound() {
  return (
    <PageContainer maxWidth="wide">
      <PageHeader title="Pagar factura" backHref="/portal/invoices" backLabel="Facturas" />
      <p className="text-muted-foreground">Factura no encontrada</p>
    </PageContainer>
  );
}

export default function PortalInvoicePayment() {
  const { id } = useParams();
  // A3-01: capturar error/refetch de las 3 queries — sin esto un fallo de red
  // mostraba "Factura no encontrada" o un saldo falso en la pantalla de cobro
  // (riesgo de pago duplicado).
  const inv = usePortalInvoices();
  const pay = usePortalPayments();
  const { data: customer } = usePortalCustomer();
  const int = usePortalPaymentIntents(id);
  const [dlgOpen, setDlgOpen] = useState(false);

  const invoices = inv.data;
  const intents = int.data;
  const invoice = invoices?.find((i) => i.id === id);
  const invoicePayments = pay.data?.filter((p) => p.invoice_id === id) ?? [];

  const isLoading = inv.isLoading || pay.isLoading;
  const hasError = inv.isError || pay.isError || int.isError;
  const retryAll = () => {
    void inv.refetch();
    void pay.refetch();
    void int.refetch();
  };

  if (isLoading) return <Skeleton className="h-96" />;
  if (hasError) return <PaymentQueryError onRetry={retryAll} />;
  if (!invoice) return <InvoiceNotFound />;

  return (
    <PaymentBody
      invoice={invoice}
      invoicePayments={invoicePayments}
      intents={intents ?? []}
      customer={customer}
      dlgOpen={dlgOpen}
      setDlgOpen={setDlgOpen}
    />
  );
}

interface PaymentBodyProps {
  invoice: NonNullable<ReturnType<typeof usePortalInvoices>["data"]>[number];
  invoicePayments: NonNullable<ReturnType<typeof usePortalPayments>["data"]>;
  intents: Intent[];
  customer: ReturnType<typeof usePortalCustomer>["data"];
  dlgOpen: boolean;
  setDlgOpen: (v: boolean) => void;
}

function PaymentBody({
  invoice, invoicePayments, intents, customer, dlgOpen, setDlgOpen,
}: PaymentBodyProps) {
  const { balance, reportableBalance, pendingReported, moneda, isMxn, balanceLabel } =
    computeInvoiceTotals(invoice, invoicePayments, intents);

  const paymentSection = renderPaymentSection({
    balance,
    concept: `${invoice.invoice_number}`,
    pendingReported,
    moneda,
    isMxn,
    balanceLabel,
    // Bloqueo de negocio real: ya no queda saldo por reportar (todo cubierto
    // por pagos aplicados o reportes en revisión).
    canReport: !!customer,
    reportBlock: reportableBalance > 0 ? null : describeBusinessBlock("portal_payment_fully_reported"),
    onReport: () => setDlgOpen(true),
  });

  return (
    <PageContainer maxWidth="wide">
      <PageHeader
        title={`Pagar ${invoice.invoice_number}`}
        backHref={`/portal/invoices/${invoice.id}`}
        backLabel="Factura"
      />
      <div className="-mt-2 flex items-center gap-2 text-sm text-muted-foreground">
        <StatusBadge status={invoice.status} />
        <span>Saldo: <span className="tabular-nums">{balanceLabel}</span></span>
      </div>

      {paymentSection}

      {intents.length > 0 && <PortalIntentsTable intents={intents} />}

      {customer && isMxn && (
        <ReportTransferDialog
          open={dlgOpen}
          onOpenChange={setDlgOpen}
          invoiceId={invoice.id}
          customerId={customer.id}
          balance={reportableBalance}
          pendingInReview={pendingReported}
        />
      )}
    </PageContainer>
  );
}

