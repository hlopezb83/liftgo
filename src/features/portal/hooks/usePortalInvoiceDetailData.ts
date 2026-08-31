import { usePortalInvoices, usePortalPayments } from "@/features/customers";
import { sumMoney } from "@/lib/money";

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
  /** Saldo canónico FX-aware calculado en `get_portal_invoices` / v_invoices_with_balance. */
  balance?: number | string | null;
  /** Total pagado canónico (ya considera conversión de moneda cuando aplica). */
  paid_amount?: number | string | null;
  cfdi_uuid?: string | null;
  status?: string | null;
  moneda?: string | null;
  line_items?: unknown;
};

/**
 * Deriva totales, saldo y banderas de acción a partir de la factura y sus pagos.
 *
 * A1-3: el saldo y el total pagado se toman del RPC `get_portal_invoices`
 * (columnas `balance`/`paid_amount`, ya FX-aware y con `credited_amount`
 * descontado en la DB) en vez de recalcularlos aquí sumando `payments.amount`
 * con floats crudos y sin conversión de moneda. `payments` se conserva sólo
 * para el historial de pagos; su suma ya no determina el saldo mostrado.
 */
export function deriveInvoiceTotals(invoice: InvoiceLike | undefined, payments: PortalPaymentRow[]) {
  const totalPaid = invoice?.paid_amount != null
    ? Number(invoice.paid_amount)
    : sumMoney(payments.map((p) => Number(p.amount)));
  // FIX-FE-09: clamp a 0 — sobrepago o NC mayor al remanente mostraba un saldo
  // negativo, inconsistente con el estado de cuenta (que presenta $0). Mismo
  // criterio que computeInvoiceTotals de PortalInvoicePayment.
  const balance = invoice?.balance != null
    ? Math.max(0, Number(invoice.balance))
    : Math.max(0, Number(invoice?.total ?? 0) - totalPaid - Number(invoice?.credited_amount ?? 0));
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
