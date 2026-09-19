import { BlockedActionButton } from "@/components/feedback/BlockedActionButton";
import { BlockedActionNotice } from "@/components/feedback/BlockedActionNotice";
import { QueryErrorState } from "@/components/feedback/QueryErrorState";
import { StatusBadge } from "@/components/feedback/StatusBadge";
import { PageContainer } from "@/components/layout/PageContainer";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type {
  PortalInvoiceRow,
  PortalPaymentRow,
  usePortalCustomer,
} from "@/features/customers";
import { formatDateMty } from "@/lib/format/dateFormats";
import { formatCurrency, formatCurrencyWithCode } from "@/lib/format/formatCurrency";
import { describeBusinessBlock, type BusinessBlock } from "@/lib/rules/businessBlocks";
import { ReportTransferDialog } from "../components/ReportTransferDialog";
import { StpTransferCard } from "../components/StpTransferCard";

export type Intent = {
  id: string;
  transfer_date: string;
  amount: number | string;
  tracking_key: string | null;
  status: string;
};

const intentStatusLabel = (status: string) =>
  status === "pending_review" ? "En revisión" : status === "approved" ? "Aprobado" : "Rechazado";

export function PortalIntentsTable({ intents }: { intents: Intent[] }) {
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
            {intents.map((intent) => (
              <TableRow key={intent.id}>
                <TableCell>{formatDateMty(intent.transfer_date)}</TableCell>
                <TableCell className="font-mono">{formatCurrency(Number(intent.amount))}</TableCell>
                <TableCell
                  className="font-mono max-w-[10rem] truncate"
                  title={intent.tracking_key ?? undefined}
                >
                  {intent.tracking_key ?? "—"}
                </TableCell>
                <TableCell>{intentStatusLabel(intent.status)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

export function ForeignCurrencyNotice({ moneda, balanceLabel }: { moneda: string; balanceLabel: string }) {
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

export function MxnPaymentSection({ balance, concept, pendingReported, canReport, reportBlock, onReport }: {
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

export function PaidCard() {
  return (
    <Card>
      <CardContent className="pt-6">
        <p className="text-sm">Esta factura ya está pagada. ¡Gracias!</p>
      </CardContent>
    </Card>
  );
}

type InvoiceLike = {
  balance?: number | string | null;
  total: number | string;
  credited_amount?: number | string | null;
  moneda?: string | null;
};

export function computeInvoiceTotals(
  invoice: InvoiceLike,
  invoicePayments: { amount: number | string }[],
  intents: { amount: number | string; status: string }[],
) {
  const totalPaid = invoicePayments.reduce((sum, payment) => sum + Number(payment.amount), 0);
  const pendingReported = intents
    .filter((intent) => intent.status === "pending_review")
    .reduce((sum, intent) => sum + Number(intent.amount), 0);
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

export interface PaymentSectionArgs {
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

export function renderPaymentSection(args: PaymentSectionArgs) {
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

export function PaymentQueryError({ onRetry }: { onRetry: () => void }) {
  return (
    <PageContainer maxWidth="wide">
      <PageHeader title="Pagar factura" />
      <QueryErrorState entity="la información de pago" onRetry={onRetry} />
    </PageContainer>
  );
}

export function InvoiceNotFound() {
  return (
    <PageContainer maxWidth="wide">
      <PageHeader title="Pagar factura" backHref="/portal/invoices" backLabel="Facturas" />
      <p className="text-muted-foreground">Factura no encontrada</p>
    </PageContainer>
  );
}

export interface PaymentBodyProps {
  invoice: PortalInvoiceRow;
  invoicePayments: PortalPaymentRow[];
  intents: Intent[];
  customer: ReturnType<typeof usePortalCustomer>["data"];
  dlgOpen: boolean;
  setDlgOpen: (value: boolean) => void;
}

export function PaymentBody({
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