import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { nowMty } from "@/lib/utils";
import { bucketByWeek, type CashFlowBucket, type CashFlowItem } from "../lib/cashFlowUtils";

interface Args {
  weeks: number;
  initialBalance: number;
  safetyBuffer: number;
}

const ACTIVE_INVOICE_STATUSES = ["sent", "partial", "overdue", "partially_paid"];
const ACTIVE_BILL_STATUSES = ["pending", "overdue", "partially_paid"];

/** Convierte a MXN usando el tipo de cambio del documento (USD u otra moneda). */
function toMxn(amount: number, currency: string | null, fx: number | null | undefined): number {
  const code = (currency ?? "MXN").toUpperCase();
  if (code === "MXN") return amount;
  const rate = Number(fx ?? 0);
  return rate > 0 ? amount * rate : amount;
}

export function useCashFlowProjection({ weeks, initialBalance, safetyBuffer }: Args) {
  return useQuery({
    queryKey: ["cash_flow_projection", weeks, initialBalance, safetyBuffer],
    staleTime: 60_000,
    queryFn: async (): Promise<CashFlowBucket[]> => {
      const [invRes, billRes, payRes] = await Promise.all([
        supabase
          .from("invoices")
          .select("id, invoice_number, total, due_date, customer_name, moneda, tipo_cambio, status")
          .in("status", ACTIVE_INVOICE_STATUSES)
          .not("due_date", "is", null),
        supabase
          .from("supplier_bills")
          .select(
            "id, bill_number, balance, due_date, currency, exchange_rate, status, approval_status, supplier_id, suppliers(name)",
          )
          .in("status", ACTIVE_BILL_STATUSES)
          .in("approval_status", ["not_required", "approved"])
          .not("due_date", "is", null),
        supabase
          .from("payments")
          .select("invoice_id, amount, currency, exchange_rate"),
      ]);
      if (invRes.error) throw invRes.error;
      if (billRes.error) throw billRes.error;
      if (payRes.error) throw payRes.error;

      // Total cobrado por factura, ya en MXN.
      const paidByInvoice = new Map<string, number>();
      for (const p of payRes.data ?? []) {
        const mxn = toMxn(Number(p.amount), p.currency, p.exchange_rate);
        paidByInvoice.set(p.invoice_id, (paidByInvoice.get(p.invoice_id) ?? 0) + mxn);
      }

      const items: CashFlowItem[] = [];

      for (const inv of invRes.data ?? []) {
        if (!inv.due_date) continue;
        const totalMxn = toMxn(Number(inv.total), inv.moneda ?? "MXN", inv.tipo_cambio);
        const balance = totalMxn - (paidByInvoice.get(inv.id) ?? 0);
        if (balance <= 0.01) continue;
        items.push({
          id: inv.id,
          number: inv.invoice_number,
          partyName: inv.customer_name ?? "—",
          dueDate: inv.due_date,
          amountMxn: balance,
          kind: "in",
          navigatePath: `/invoices/${inv.id}`,
        });
      }

      for (const b of billRes.data ?? []) {
        if (!b.due_date) continue;
        const balanceMxn = toMxn(Number(b.balance), b.currency, b.exchange_rate);
        if (balanceMxn <= 0.01) continue;
        const supplierName =
          (b.suppliers as { name: string } | null)?.name ?? "—";
        items.push({
          id: b.id,
          number: b.bill_number,
          partyName: supplierName,
          dueDate: b.due_date,
          amountMxn: balanceMxn,
          kind: "out",
          navigatePath: `/cuentas-por-pagar?bill=${b.id}`,
        });
      }

      return bucketByWeek(items, nowMty(), weeks, initialBalance, safetyBuffer);
    },
  });
}
