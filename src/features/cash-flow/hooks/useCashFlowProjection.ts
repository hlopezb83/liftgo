import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { nowMty } from "@/lib/utils";
import { bucketByWeek, type CashFlowBucket, type CashFlowItem } from "../lib/cashFlowUtils";

interface Args {
  weeks: number;
  initialBalance: number;
  safetyBuffer: number;
}

const ACTIVE_INVOICE_STATUSES = ["sent", "partial", "overdue"] as const;
const ACTIVE_BILL_STATUSES = ["pending", "partial", "overdue"] as const;

/** Convierte a MXN usando el tipo de cambio del documento (USD u otra moneda). */
function toMxn(amount: number, currency: string | null, fx: number | string | null | undefined): number {
  const code = (currency ?? "MXN").toUpperCase();
  if (code === "MXN") return amount;
  const rate = Number(fx ?? 0);
  return rate > 0 ? amount * rate : amount;
}

type InvoiceRow = { id: string; invoice_number: string; total: number | string; due_date: string | null; customer_name: string | null; moneda: string | null; tipo_cambio: number | string | null };
type BillRow = { id: string; bill_number: string; balance: number | string; due_date: string | null; currency: string | null; exchange_rate: number | string | null; suppliers: { name: string } | null };

function buildPaidByInvoice(payments: ReadonlyArray<{ invoice_id: string; amount: number | string; currency: string | null; exchange_rate: number | string | null }>) {
  const map = new Map<string, number>();
  for (const p of payments) {
    const mxn = toMxn(Number(p.amount), p.currency, p.exchange_rate);
    map.set(p.invoice_id, (map.get(p.invoice_id) ?? 0) + mxn);
  }
  return map;
}

function invoiceItem(inv: InvoiceRow, paidByInvoice: Map<string, number>): CashFlowItem | null {
  if (!inv.due_date) return null;
  const totalMxn = toMxn(Number(inv.total), inv.moneda ?? "MXN", inv.tipo_cambio);
  const balance = totalMxn - (paidByInvoice.get(inv.id) ?? 0);
  if (balance <= 0.01) return null;
  return {
    id: inv.id,
    number: inv.invoice_number,
    partyName: inv.customer_name ?? "—",
    dueDate: inv.due_date,
    amountMxn: balance,
    kind: "in",
    navigatePath: `/invoices/${inv.id}`,
  };
}

function billItem(b: BillRow): CashFlowItem | null {
  if (!b.due_date) return null;
  const balanceMxn = toMxn(Number(b.balance), b.currency, b.exchange_rate);
  if (balanceMxn <= 0.01) return null;
  return {
    id: b.id,
    number: b.bill_number,
    partyName: b.suppliers?.name ?? "—",
    dueDate: b.due_date,
    amountMxn: balanceMxn,
    kind: "out",
    navigatePath: `/cuentas-por-pagar?bill=${b.id}`,
  };
}

export function useCashFlowProjection({ weeks, initialBalance, safetyBuffer }: Args) {
  return useQuery({
    queryKey: ["cash_flow_projection", weeks, initialBalance, safetyBuffer],
    staleTime: 60_000,
    queryFn: async (): Promise<CashFlowBucket[]> => {
      const [invRes, billRes, payRes] = await Promise.all([
        supabase.from("invoices")
          .select("id, invoice_number, total, due_date, customer_name, moneda, tipo_cambio, status")
          .in("status", ACTIVE_INVOICE_STATUSES)
          .not("due_date", "is", null),
        supabase.from("supplier_bills")
          .select("id, bill_number, balance, due_date, currency, exchange_rate, status, approval_status, supplier_id, suppliers(name)")
          .in("status", ACTIVE_BILL_STATUSES)
          .in("approval_status", ["not_required", "approved"])
          .not("due_date", "is", null),
        supabase.from("payments").select("invoice_id, amount, currency, exchange_rate"),
      ]);
      if (invRes.error) throw invRes.error;
      if (billRes.error) throw billRes.error;
      if (payRes.error) throw payRes.error;

      const paidByInvoice = buildPaidByInvoice(payRes.data ?? []);
      const items: CashFlowItem[] = [];
      for (const inv of (invRes.data ?? []) as InvoiceRow[]) {
        const item = invoiceItem(inv, paidByInvoice);
        if (item) items.push(item);
      }
      for (const b of (billRes.data ?? []) as unknown as BillRow[]) {
        const item = billItem(b);
        if (item) items.push(item);
      }
      return bucketByWeek(items, nowMty(), weeks, initialBalance, safetyBuffer);
    },
  });
}
