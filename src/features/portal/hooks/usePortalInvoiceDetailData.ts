import { usePortalInvoices, usePortalPayments } from "@/features/customers";

// R6-FE-05 (N6-POR-01): el shape real de invoices.line_items (verificado en
// DB, jsonb_object_keys) es description/unit_price/qty/total. Se conservan
// quantity/amount como fallback por si quedaran filas legadas.
export type PortalLineItem = {
  description?: string;
  qty?: number;
  total?: number;
  unit_price?: number;
  quantity?: number;
  amount?: number;
};
export type PortalPaymentRow = {
  id: string;
  payment_date: string;
  payment_method: string | null;
  reference_number: string | null;
  amount: number | string;
};

type InvoiceLike = {
  total: number | string;
  credited_amount?: number | string | null;
  cfdi_uuid?: string | null;
  status?: string | null;
  moneda?: string | null;
  line_items?: unknown;
};

/** Deriva totales, saldo y banderas de acción a partir de la factura y sus pagos. */
export function deriveInvoiceTotals(invoice: InvoiceLike | undefined, payments: PortalPaymentRow[]) {
  const totalPaid = payments.reduce((sum, p) => sum + Number(p.amount), 0);
  // v7.209.0 A3: restar credited_amount (NCs timbradas) para alinear el saldo
  // del detalle con el estado de cuenta del portal y con la vista interna.
  // FIX-FE-09: clamp a 0 — sobrepago o NC mayor al remanente mostraba un saldo
  // negativo, inconsistente con el estado de cuenta (que presenta $0). Mismo
  // criterio que computeInvoiceTotals de PortalInvoicePayment.
  const balance = Math.max(0, Number(invoice?.total ?? 0) - totalPaid - Number(invoice?.credited_amount ?? 0));
  return {
    totalPaid,
    balance,
    hasCfdi: Boolean(invoice?.cfdi_uuid),
    showPay: balance > 0 && invoice?.status !== "cancelled",
  };
}

/**
 * Centraliza la carga y derivación de datos del detalle de factura del portal,
 * dejando la página como un contenedor de UI puro.
 */
export function usePortalInvoiceDetailData(id: string | undefined) {
  const invoicesQuery = usePortalInvoices();
  const paymentsQuery = usePortalPayments();

  const invoice = invoicesQuery.data?.find((i) => i.id === id);
  const invoicePayments = (paymentsQuery.data?.filter((p) => p.invoice_id === id) ?? []) as PortalPaymentRow[];
  const lineItems = (Array.isArray(invoice?.line_items) ? invoice.line_items : []) as PortalLineItem[];

  const refetchAll = () => {
    void invoicesQuery.refetch();
    void paymentsQuery.refetch();
  };

  return {
    invoice,
    invoicePayments,
    lineItems,
    currency: invoice?.moneda ?? "MXN",
    ...deriveInvoiceTotals(invoice, invoicePayments),
    isLoading: invoicesQuery.isLoading || paymentsQuery.isLoading,
    isError: invoicesQuery.isError || paymentsQuery.isError,
    refetchAll,
  };
}
