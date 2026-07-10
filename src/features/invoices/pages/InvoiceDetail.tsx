import { useParams } from "react-router-dom";
import { useInvoice } from "../hooks/invoices/useInvoices";
import { useInvoiceBookings } from "../hooks/invoices/useInvoiceBookings";
import type { BookingWithForklift } from "@/features/bookings";
import { usePayments } from "../hooks/usePayments";
import { useQuote } from "@/features/quotes";
import { useUserRole } from "@/features/users";
import { useCompanySettings } from "@/features/company-settings";
import { useInvoiceDetailActions } from "../hooks/invoiceDetail/useInvoiceDetailActions";
import { PageContainer } from "@/components/layout/PageContainer";
import { useCreditNotesForInvoice } from "../hooks/creditNotes/useCreditNotes";
import { Skeleton } from "@/components/ui/skeleton";
import { parseLineItems } from "@/lib/domain/lineItems";
import type { LineItem } from "@/lib/domain/invoiceHelpers";
import { computeInvoiceVisibility } from "../lib/invoiceVisibility";
import { InvoiceDetailBody } from "../components/invoice-detail/InvoiceDetailBody";

function computeCreditedAmount(creditNotes: Array<{ cfdi_status: string | null; status: string; cancellation_status: string | null; total: number }>): number {
  return creditNotes
    .filter((cn) => cn.cfdi_status === "stamped" && cn.status !== "cancelled" && cn.cancellation_status !== "accepted")
    .reduce((s, cn) => s + Number(cn.total), 0);
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
  const totalPaid = paymentList.reduce((sum, p) => sum + Number(p.amount), 0);
  const creditedAmount = computeCreditedAmount(creditNotes ?? []);
  const total = Number(invoice.total);
  const visibility = computeInvoiceVisibility(
    invoice as Parameters<typeof computeInvoiceVisibility>[0],
    company as Parameters<typeof computeInvoiceVisibility>[1],
  );
  return {
    paymentList, lineItems, cfdiStatus, totalPaid, creditedAmount, total,
    balance: total - totalPaid - creditedAmount,
    showCfdiError: Boolean(invoice.cfdi_error_message) && cfdiStatus !== "stamped",
    showCollectionNotes: !["paid", "draft"].includes(invoice.status),
    visibility,
    ppdStamped: visibility.showRepColumn,
  };
}

export default function InvoiceDetail() {
  const { id } = useParams();
  const { data: invoice, isLoading, refetch } = useInvoice(id);
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
  if (!invoice || !id) {
    return <PageContainer><p className="text-muted-foreground">Factura no encontrada</p></PageContainer>;
  }

  const derived = deriveInvoiceData(invoice, payments, creditNotes, company);

  return (
    <PageContainer maxWidth="wide">
      <InvoiceDetailBody
        invoice={invoice as Parameters<typeof InvoiceDetailBody>[0]["invoice"]}
        id={id}
        derived={derived}
        actions={actions as Parameters<typeof InvoiceDetailBody>[0]["actions"]}
        userRole={userRole ?? undefined}
        sourceQuote={sourceQuote}
        sourceBookings={sourceBookings}
        refetch={refetch}
      />
    </PageContainer>
  );
}
