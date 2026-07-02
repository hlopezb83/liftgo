import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { EXCLUDE_E2E_FILTER } from "@/lib/supabase/constants";

export interface ReconciliationRow {
  id: string;
  invoice_number: string;
  issued_at: string;
  customer_name: string | null;
  status: string;
  cfdi_status: string | null;
  cancellation_status: string | null;
  cfdi_uuid: string | null;
  facturapi_invoice_id: string | null;
  facturapi_env: string | null;
  total: number;
}

export interface ReconciliationFilters {
  from: string; // YYYY-MM-DD
  to: string;
  fiscalState: "all" | "stamped" | "cancelled" | "draft";
  env: "all" | "test" | "live";
}

export interface ReconciliationSummary {
  totalStampedLive: number;
  countStamped: number;
  countCancelled: number;
  countDraft: number;
  gaps: string[];
}

function computeSummary(rows: ReconciliationRow[]): ReconciliationSummary {
  let totalStampedLive = 0;
  let countStamped = 0;
  let countCancelled = 0;
  let countDraft = 0;

  for (const r of rows) {
    if (r.cfdi_status === "cancelled" || r.status === "cancelled") {
      countCancelled++;
    } else if (r.cfdi_status === "stamped") {
      countStamped++;
      if (r.facturapi_env === "live") totalStampedLive += Number(r.total);
    } else if (r.status === "draft") {
      countDraft++;
    }
  }

  // Detect folio gaps within the range (only for FAC- style)
  const nums: number[] = [];
  for (const r of rows) {
    const m = r.invoice_number.match(/(\d+)$/);
    if (m) nums.push(parseInt(m[1], 10));
  }
  nums.sort((a, b) => a - b);
  const gaps: string[] = [];
  if (nums.length >= 2) {
    for (let i = nums[0]; i <= nums[nums.length - 1]; i++) {
      if (!nums.includes(i)) gaps.push(String(i).padStart(4, "0"));
    }
  }

  return { totalStampedLive, countStamped, countCancelled, countDraft, gaps };
}

export function useReconciliationData(filters: ReconciliationFilters) {
  return useQuery({
    queryKey: ["invoices", "reconciliation", filters],
    staleTime: 30_000,
    queryFn: async () => {
      let q = supabase
        .from("invoices")
        .select(
          "id,invoice_number,issued_at,customer_name,status,cfdi_status,cancellation_status,cfdi_uuid,facturapi_invoice_id,facturapi_env,total",
        )
        .or(EXCLUDE_E2E_FILTER)
        .gte("issued_at", filters.from)
        .lte("issued_at", filters.to)
        .order("invoice_number", { ascending: true });

      if (filters.fiscalState === "stamped") q = q.eq("cfdi_status", "stamped");
      else if (filters.fiscalState === "cancelled") q = q.eq("cfdi_status", "cancelled");
      else if (filters.fiscalState === "draft") q = q.eq("status", "draft");

      if (filters.env === "test") q = q.eq("facturapi_env", "test");
      else if (filters.env === "live") q = q.eq("facturapi_env", "live");

      const { data, error } = await q;
      if (error) throw error;

      const rows = (data ?? []) as ReconciliationRow[];
      return { rows, summary: computeSummary(rows) };
    },
  });
}
