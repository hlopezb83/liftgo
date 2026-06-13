import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import type { SupplierRepStatus } from "../lib/supplierRepConstants";

type Row = Database["public"]["Tables"]["supplier_bills"]["Row"];

export interface BillRepSummary {
  pending: number;
  received: number;
  rejected: number;
  total: number;
  worst: SupplierRepStatus; // pending > rejected > received > not_required
}

export interface SupplierBillListItem extends Row {
  suppliers: { id: string; name: string } | null;
  rep_summary: BillRepSummary;
}

export const SUPPLIER_BILLS_QK = ["supplier_bills"] as const;

type PaymentRepRow = {
  bill_id: string;
  rep_required: boolean;
  rep_status: SupplierRepStatus;
};

function emptySummary(): BillRepSummary {
  return { pending: 0, received: 0, rejected: 0, total: 0, worst: "not_required" };
}

function worstOf(a: SupplierRepStatus, b: SupplierRepStatus): SupplierRepStatus {
  const rank: Record<SupplierRepStatus, number> = {
    pending: 4, rejected: 3, received: 2, not_required: 1,
  };
  return rank[a] >= rank[b] ? a : b;
}

function accumulatePayment(summaryMap: Map<string, BillRepSummary>, p: PaymentRepRow) {
  if (!p.rep_required) return;
  const cur = summaryMap.get(p.bill_id) ?? emptySummary();
  cur.total += 1;
  if (p.rep_status === "pending") cur.pending += 1;
  else if (p.rep_status === "received") cur.received += 1;
  else if (p.rep_status === "rejected") cur.rejected += 1;
  cur.worst = worstOf(cur.worst, p.rep_status);
  summaryMap.set(p.bill_id, cur);
}

export function useSupplierBills() {
  return useQuery({
    queryKey: SUPPLIER_BILLS_QK,
    staleTime: 60_000,
    queryFn: async (): Promise<SupplierBillListItem[]> => {
      const [billsRes, paymentsRes] = await Promise.all([
        supabase
          .from("supplier_bills")
          .select("*, suppliers(id, name)")
          .order("issue_date", { ascending: false }),
        supabase
          .from("supplier_payments")
          .select("bill_id, rep_required, rep_status"),
      ]);
      if (billsRes.error) throw billsRes.error;
      if (paymentsRes.error) throw paymentsRes.error;

      const summaryMap = new Map<string, BillRepSummary>();
      for (const p of (paymentsRes.data ?? []) as PaymentRepRow[]) accumulatePayment(summaryMap, p);

      const bills = (billsRes.data ?? []) as unknown as SupplierBillListItem[];
      for (const b of bills) {
        b.rep_summary = summaryMap.get(b.id) ?? emptySummary();
      }
      return bills;
    },
  });
}
