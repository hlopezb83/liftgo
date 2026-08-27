import { useParams } from "react-router";
import { EmptyState } from "@/components/feedback/EmptyState";
import { QueryErrorState } from "@/components/feedback/QueryErrorState";
import { PageContainer } from "@/components/layout/PageContainer";
import { Skeleton } from "@/components/ui/skeleton";
import type { BookingWithForklift } from "@/features/bookings";
import { useCompanySettings } from "@/features/company-settings";
import { useQuote } from "@/features/quotes";
import { useUserRole } from "@/features/users";
import { useNavigateTransition } from "@/hooks/useNavigateTransition";
import type { LineItem } from "@/lib/domain/invoiceHelpers";
import { parseLineItems } from "@/lib/domain/lineItems";
import { toMxn } from "@/lib/money";
import { InvoiceDetailBody } from "../components/invoice-detail/InvoiceDetailBody";
import { useCreditNotesForInvoice } from "../hooks/creditNotes/useCreditNotes";
import { useInvoiceDetailActions } from "../hooks/invoiceDetail/useInvoiceDetailActions";
import { useInvoiceBookings } from "../hooks/invoices/useInvoiceBookings";
import { useInvoice } from "../hooks/invoices/useInvoices";
import { usePayments } from "../hooks/usePayments";
import { computeInvoiceVisibility } from "../lib/invoiceVisibility";

function computeCreditedAmount(creditNotes: Array<{ cfdi_status: string | null; status: string; cancellation_status: string | null; total: number }>): number {
  return creditNotes
    .filter((cn) => cn.cfdi_status === "stamped" && cn.status !== "cancelled" && cn.cancellation_status !== "accepted")
    .reduce((s, cn) => s + Number(cn.total), 0);
}


type PaymentLike = {
  amount: number;
  amount_mxn?: number | null;
  currency?: string | null;
  exchange_rate?: number | string | null;
};

/**
 * FIX B6: el saldo sumaba `p.amount` en crudo. Un pago capturado en otra
 * moneda se restaba 1:1 del total (como abonar 100 dólares y descontar 100
 * pesos), descuadrando el saldo sin ninguna advertencia.
 *
 * Se normaliza cada pago a la moneda de la FACTURA: se lleva a MXN (con
 * `amount_mxn` o el tipo de cambio del pago) y, si la factura está en divisa,
 * se regresa con el tipo de cambio del documento. Los pagos en otra moneda sin
 * tipo de cambio usable no se pueden convertir y se cuentan aparte para
 * avisarle al usuario en vez de descuadrar el saldo en silencio.
 */
export function sumPaymentsInInvoiceCurrency(
  payments: ReadonlyArray<PaymentLike>,
  invoiceCurrency: string | null | undefined,
  invoiceRate: number | string | null | undefined,
): { totalPaid: number; unconvertible: number } {
  const invCode = (invoiceCurrency ?? "MXN").toUpperCase();
  const invRate = Number(invoiceRate ?? 0);
  let totalPaid = 0;
  let unconvertible = 0;

  for (const p of payments) {
    const payCode = (p.currency ?? "MXN").toUpperCase();
    const amount = Number(p.amount ?? 0);
    if (payCode === invCode) {
      totalPaid += amount;
      continue;
    }
    const payRate = Number(p.exchange_rate ?? 0);
    const mxn =
      p.amount_mxn != null
        ? Number(p.amount_mxn)
        : payCode === "MXN"
          ? amount
          : Number.isFinite(payRate) && payRate > 0
            ? toMxn(amount, payCode, payRate)
            : null;
    if (mxn == null) {
      unconvertible += 1;
      continue;
    }
    if (invCode === "MXN") {
      totalPaid += mxn;
    } else if (Number.isFinite(invRate) && invRate > 0) {
      totalPaid += mxn / invRate;
    } else {
      unconvertible += 1;
    }
  }

  return { totalPaid, unconvertible };
}

function deriveInvoiceData(
  invoice: NonNullable<ReturnType<typeof useInvoice>["data"]>,
  payments: ReturnType<typeof usePayments>["data"],
  creditNotes: ReturnType<typeof useCreditNotesForInvoice>["data"],
  company: ReturnType<typeof useCompanySettings>["data"],
) {
  const paymentList = payments ?? [];
  const lineItems = parseLineItems<LineItem>(invoice.line_items);
  const cfdiStatus = invoice.cfdi_status ?? "pending";
  const { totalPaid, unconvertible: unconvertiblePayments } = sumPaymentsInInvoiceCurrency(
    paymentList as ReadonlyArray<PaymentLike>,
    invoice.moneda,
    invoice.tipo_cambio,
  );
  const creditedAmount = computeCreditedAmount(creditNotes ?? []);
  const total = Number(invoice.total);
  const visibility = computeInvoiceVisibility(
    invoice as Parameters<typeof computeInvoiceVisibility>[0],
    company as Parameters<typeof computeInvoiceVisibility>[1],
  );
  return {
    paymentList, lineItems, cfdiStatus, totalPaid, creditedAmount, total, unconvertiblePayments,
    balance: total - totalPaid - creditedAmount,
    showCfdiError: Boolean(invoice.cfdi_error_message) && cfdiStatus !== "stamped",
    showCollectionNotes: !["paid", "draft"].includes(invoice.status),
    visibility,
    ppdStamped: visibility.showRepColumn,
  };
}

export default function InvoiceDetail() {
  const { id } = useParams();
  const navigate = useNavigateTransition();
  const { data: invoice, isLoading, isError, refetch } = useInvoice(id);
  const { data: payments } = usePayments(id);
  const { data: creditNotes = [] } = useCreditNotesForInvoice(id);
  const { data: userRole } = useUserRole();
  const { data: company } = useCompanySettings();
  const { data: sourceQuote } = useQuote(invoice?.quote_id ?? undefined);
  const { data: invoiceBookingsRows } = useInvoiceBookings(id);
  const sourceBookings: BookingWithForklift[] = (invoiceBookingsRows ?? [])
    .map((r) => (r as unknown as { bookings: BookingWithForklift | null }).bookings)
    .filter((b): b is BookingWithForklift => !!b);

  const actions = useInvoiceDetailActions(invoice ?? undefined, refetch);

  if (isLoading) {
    return (
      <PageContainer className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64" />
      </PageContainer>
    );
  }
  if (isError) {
    return (
      <PageContainer>
        <QueryErrorState entity="la factura" onRetry={() => { void refetch(); }} />
      </PageContainer>
    );
  }
  if (!invoice || !id) {
    return (
      <PageContainer>
        <EmptyState
          title="Factura no encontrada"
          actionLabel="Volver"
          onAction={() => navigate("/invoices")}
        />
      </PageContainer>
    );
  }

  const derived = deriveInvoiceData(invoice, payments, creditNotes, company);

  return (
    <PageContainer maxWidth="wide">
      <InvoiceDetailBody
        invoice={invoice}
        id={id}
        derived={derived}
        actions={actions}
        userRole={userRole ?? undefined}
        sourceQuote={sourceQuote}
        sourceBookings={sourceBookings}
        refetch={refetch}
      />
    </PageContainer>
  );
}

