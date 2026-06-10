import { supabase } from "@/integrations/supabase/client";
import { assertRowsAffected } from "@/lib/supabase/assertRowsAffected";
import { roundMoney, sumMoney } from "@/lib/money";

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

/**
 * Reconciles invoice status (paid/partial/sent) after a payment is created, edited or removed.
 * Pure orchestration: read payments + invoice, decide target status, persist.
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
    const latestDate = rows.reduce<string>(
      (latest, p) => (p.payment_date && p.payment_date > latest ? p.payment_date : latest),
      paidAtFallback ?? rows[0]?.payment_date ?? "",
    );
    const { data: paid, error: paidErr } = await supabase
      .from("invoices")
      .update({ status: "paid", paid_at: latestDate })
      .eq("id", invoiceId)
      .select("id");
    if (paidErr) throw paidErr;
    assertRowsAffected(paid, "Marcar factura como pagada");
    return;
  }
  if (balance > 0 && totalPaid > 0 && invoice.status !== "partial") {
    const { data: partial, error: partialErr } = await supabase
      .from("invoices")
      .update({ status: "partial", paid_at: null })
      .eq("id", invoiceId)
      .select("id");
    if (partialErr) throw partialErr;
    assertRowsAffected(partial, "Marcar factura como parcial");
    return;
  }
  if (totalPaid === 0 && invoice.status !== "sent") {
    const { data: sent, error: sentErr } = await supabase
      .from("invoices")
      .update({ status: "sent", paid_at: null })
      .eq("id", invoiceId)
      .select("id");
    if (sentErr) throw sentErr;
    assertRowsAffected(sent, "Restablecer estado de factura");
  }
}
