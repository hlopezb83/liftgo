import { supabase } from "@/integrations/supabase/client";
import { roundMoney, sumMoney } from "@/lib/money";
import { assertRowsAffected } from "@/lib/supabase/assertRowsAffected";

interface PaymentLite { amount: number | string; payment_date?: string }

async function fetchPaymentsSum(invoiceId: string): Promise<{ rows: PaymentLite[]; total: number }> {
  const { data } = await supabase
    .from("payments")
    .select("amount, payment_date")
    .eq("invoice_id", invoiceId);
  const rows = (data || []) as PaymentLite[];
  const total = sumMoney(rows.map((p) => Number(p.amount)));
  return { rows, total };
}

async function applyStatus(
  invoiceId: string,
  patch: { status: string; paid_at: string | null },
  label: string,
): Promise<void> {
  const { data, error } = await supabase
    .from("invoices")
    .update(patch)
    .eq("id", invoiceId)
    .select("id");
  if (error) throw error;
  assertRowsAffected(data, label);
}

function latestPaymentDate(rows: PaymentLite[], fallback: string | null): string {
  return rows.reduce<string>(
    (latest, p) => (p.payment_date && p.payment_date > latest ? p.payment_date : latest),
    fallback ?? rows[0]?.payment_date ?? "",
  );
}

/**
 * Reconciles invoice status (paid/partial/sent) after a payment is created, edited or removed.
 */
export async function syncInvoiceStatus(invoiceId: string, paidAtFallback: string | null) {
  const { rows, total: totalPaid } = await fetchPaymentsSum(invoiceId);
  const { data: invoice } = await supabase
    .from("invoices")
    .select("total, status")
    .eq("id", invoiceId)
    .single();
  if (!invoice) return;

  const balance = roundMoney(Number(invoice.total) - totalPaid);
  if (balance <= 0 && invoice.status !== "paid") {
    await applyStatus(invoiceId, { status: "paid", paid_at: latestPaymentDate(rows, paidAtFallback) }, "Marcar factura como pagada");
    return;
  }
  if (balance > 0 && totalPaid > 0 && invoice.status !== "partial") {
    await applyStatus(invoiceId, { status: "partial", paid_at: null }, "Marcar factura como parcial");
    return;
  }
  if (totalPaid === 0 && invoice.status !== "sent") {
    await applyStatus(invoiceId, { status: "sent", paid_at: null }, "Restablecer estado de factura");
  }
}
