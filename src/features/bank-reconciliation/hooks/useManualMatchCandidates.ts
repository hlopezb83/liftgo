import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { defineEntityQueries } from "@/lib/query/defineEntityQueries";

export type ManualMatchKind = "payment" | "supplier_payment";

export interface MatchCandidate {
  id: string;
  date: string;
  amount: number;
  reference: string | null;
  label: string;
}

async function fetchCandidates(kind: ManualMatchKind): Promise<MatchCandidate[]> {
  if (kind === "payment") {
    const { data, error } = await supabase
      .from("payments")
      .select("id, payment_date, amount, reference_number, invoices(invoice_number, customer_name)")
      .order("payment_date", { ascending: false })
      .limit(20);
    if (error) throw error;
    return (data ?? []).map((p) => ({
      id: p.id,
      date: p.payment_date,
      amount: Number(p.amount),
      reference: p.reference_number,
      label: `${(p.invoices as { invoice_number?: string } | null)?.invoice_number ?? "—"} · ${(p.invoices as { customer_name?: string } | null)?.customer_name ?? ""}`,
    }));
  }
  const { data, error } = await supabase
    .from("supplier_payments")
    .select("id, payment_date, amount, reference, supplier_bills(bill_number, suppliers(name))")
    .order("payment_date", { ascending: false })
    .limit(20);
  if (error) throw error;
  return (data ?? []).map((p) => ({
    id: p.id,
    date: p.payment_date,
    amount: Number(p.amount),
    reference: p.reference,
    label: `${(p.supplier_bills as { bill_number?: string } | null)?.bill_number ?? "—"} · ${((p.supplier_bills as { suppliers?: { name?: string } } | null)?.suppliers?.name) ?? ""}`,
  }));
}

export const manualMatchCandidateQueries = defineEntityQueries<
  "manual_match_candidates",
  MatchCandidate[],
  never
>("manual_match_candidates", {
  staleTime: 30_000,
  list: (filter) => async () => fetchCandidates((filter?.kind as ManualMatchKind) ?? "payment"),
});

export function useManualMatchCandidates(kind: ManualMatchKind, enabled = true) {
  return useQuery({
    ...manualMatchCandidateQueries.list({ kind }),
    enabled,
  });
}
