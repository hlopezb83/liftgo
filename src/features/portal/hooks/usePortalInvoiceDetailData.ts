import { usePortalInvoices, usePortalPayments } from "@/features/customers";

export type PortalLineItem = { description?: string; quantity?: number; unit_price?: number; amount?: number };
export type PortalPaymentRow = {
  id: string;
  payment_date: string;
  payment_method: string | null;
  reference_number: string | null;
  amount: number | string;
};

/**
 * Centraliza la carga y derivación de datos del detalle de factura del portal.
 * Mantiene la página como un contenedor de UI puro (complejidad baja).
 */
export function usePortalInvoiceDetailData(id: string | undefined) {
  const invoicesQuery = usePortalInvoices();
  const paymentsQuery = usePortalPayments();

  const invoice = invoicesQuery.data?.find((i) => i.id === id);
  const invoicePayments = (paymentsQuery.data?.filter((p) => p.invoice_id === id) ?? []) as PortalPaymentRow[];
  const lineItems = (Array.isArray(invoice?.line_items) ? invoice?.line_items : []) as PortalLineItem[];
  const currency = invoice?.moneda ?? "MXN";

  const totalPaid = invoicePayments.reduce((sum, p) => sum + Number(p.amount), 0);
  // v7.209.0 A3: restar credited_amount (NCs timbradas) para alinear el saldo
  // del detalle con el estado de cuenta del portal y con la vista interna.
  const balance = Number(invoice?.total ?? 0) - totalPaid - Number(invoice?.credited_amount ?? 0);

  const refetchAll = () => {
    void invoicesQuery.refetch();
    void paymentsQuery.refetch();
  };

  return {
    invoice,
    invoicePayments,
    lineItems,
    currency,
    totalPaid,
    balance,
    hasCfdi: Boolean(invoice?.cfdi_uuid),
    showPay: balance > 0 && invoice?.status !== "cancelled",
    isLoading: invoicesQuery.isLoading || paymentsQuery.isLoading,
    isError: invoicesQuery.isError || paymentsQuery.isError,
    refetchAll,
  };
}
