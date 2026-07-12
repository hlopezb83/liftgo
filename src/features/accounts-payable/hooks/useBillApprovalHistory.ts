import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { defineEntityQueries } from "@/lib/query/defineEntityQueries";

type Row = Database["public"]["Tables"]["supplier_bill_approvals"]["Row"];

export interface ApprovalHistoryItem extends Row {
  actor_name: string | null;
}

async function fetchApprovals(billId: string): Promise<ApprovalHistoryItem[]> {
  const { data, error } = await supabase
    .from("supplier_bill_approvals")
    .select("*")
    .eq("bill_id", billId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  const rows = (data ?? []) as Row[];

  const actorIds = Array.from(
    new Set(rows.map((r) => r.actor_id).filter((v): v is string => !!v)),
  );
  let names: Record<string, string> = {};
  if (actorIds.length > 0) {
    const { data: profs } = await supabase
      .from("profiles")
      .select("user_id, full_name, email")
      .in("user_id", actorIds);
    names = Object.fromEntries(
      (profs ?? []).map((p) => [p.user_id, p.full_name || p.email || ""]),
    );
  }
  return rows.map((r) => ({
    ...r,
    actor_name: r.actor_id ? names[r.actor_id] ?? null : null,
  }));
}

export const billApprovalQueries = defineEntityQueries<
  "supplier_bill_approvals",
  ApprovalHistoryItem[],
  never
>("supplier_bill_approvals", {
  staleTime: 30_000,
  list: (filter) => async () => {
    const billId = filter?.billId as string | undefined;
    if (!billId) return [];
    return fetchApprovals(billId);
  },
});

export function useSupplierBillApprovals(billId: string | null | undefined) {
  return useQuery({
    ...billApprovalQueries.list({ billId: billId ?? null }),
    enabled: !!billId,
  });
}
