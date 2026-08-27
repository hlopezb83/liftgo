import { queryOptions, useQuery } from "@tanstack/react-query";
import { isFxMissing } from "@/features/cash-flow";
import { supabase } from "@/integrations/supabase/client";
import { toMxn } from "@/lib/money";
import { e2eVisibilityFilter, LIST_FETCH_LIMIT } from "@/lib/supabase/constants";
import { invoiceKeys } from "../../lib/queryKeys";

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
  /** M-15: moneda y tipo de cambio para normalizar el total a MXN. */
  moneda: string | null;
  tipo_cambio: number | null;
}

export interface ReconciliationFilters {
  from: string; // YYYY-MM-DD
  to: string;
  fiscalState: "all" | "stamped" | "cancelled" | "draft";
  env: "all" | "test" | "live";
}

export interface ReconciliationSummary {
  /** Total timbrado (producción) normalizado a MXN. */
  totalStampedLive: number;
  /** Facturas timbradas foráneas sin tipo de cambio válido — EXCLUIDAS del total. */
  countStampedMissingFx: number;
  countStamped: number;
  countCancelled: number;
  countDraft: number;
  gaps: string[];
}

function computeSummary(rows: ReconciliationRow[]): ReconciliationSummary {
  let totalStampedLive = 0;
  let countStampedMissingFx = 0;
  let countStamped = 0;
  let countCancelled = 0;
  let countDraft = 0;

  for (const r of rows) {
    if (r.cfdi_status === "cancelled" || r.status === "cancelled") {
      countCancelled++;
    } else if (r.cfdi_status === "stamped") {
      countStamped++;
      if (r.facturapi_env === "live") {
        // M-15: antes se sumaba USD + MXN 1:1. Ahora se convierte a MXN con
        // el tipo de cambio del documento; las foráneas sin TC válido se
        // EXCLUYEN del total (sumarlas 1:1 subestima ~18×) y se contabilizan
        // aparte para mostrar la nota "N sin tipo de cambio".
        if (isFxMissing(r.moneda, r.tipo_cambio)) {
          countStampedMissingFx++;
        } else {
          totalStampedLive += toMxn(Number(r.total), r.moneda, r.tipo_cambio);
        }
      }
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

  return { totalStampedLive, countStampedMissingFx, countStamped, countCancelled, countDraft, gaps };
}

function buildReconciliationQuery(filters: ReconciliationFilters) {
  return queryOptions({
    queryKey: invoiceKeys.reconciliation(filters),
    staleTime: 30_000,
    queryFn: async () => {
      let q = supabase
        .from("invoices")
        .select(
          "id,invoice_number,issued_at,customer_name,status,cfdi_status,cancellation_status,cfdi_uuid,facturapi_invoice_id,facturapi_env,total,moneda,tipo_cambio",
        )
        .or(e2eVisibilityFilter())
        .gte("issued_at", filters.from)
        .lte("issued_at", filters.to)
        .order("invoice_number", { ascending: true })
        // Ronda D·#2: sin límite explícito PostgREST cortaba en 1000 filas y el
        // total timbrado / detección de huecos de folio quedaba incompleto.
        .limit(LIST_FETCH_LIMIT);

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

export function useReconciliationData(filters: ReconciliationFilters) {
  return useQuery(buildReconciliationQuery(filters));
}
