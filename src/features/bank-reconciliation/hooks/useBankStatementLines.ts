import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { bankLineKeys } from "../lib/queryKeys";
import type { BankLineStatus } from "../lib/bankReconciliationConstants";

export interface BankStatementLine {
  id: string;
  import_id: string;
  bank_account_id: string;
  posted_date: string;
  description: string;
  signed_amount: number;
  reference: string | null;
  status: BankLineStatus;
  matched_payment_id: string | null;
  matched_supplier_payment_id: string | null;
  suggested_payment_id: string | null;
  suggested_supplier_payment_id: string | null;
  match_score: number | null;
  matched_at: string | null;
  ignored_reason: string | null;
}

export interface BankStatementLineFilters {
  status?: BankLineStatus | "all";
  search?: string;
  page?: number;
  pageSize?: number;
}

export interface BankReconciliationKpis {
  totalCount: number;
  matchedCount: number;
  pendingCount: number;
  ignoredCount: number;
  charges: number;
  credits: number;
}

interface BankStatementLinePageRpc {
  rows?: BankStatementLine[];
  total_count?: number | string;
}

interface BankKpiRpcRow {
  total_count: number | string;
  matched_count: number | string;
  pending_count: number | string;
  ignored_count: number | string;
  charges: number | string;
  credits: number | string;
}

type UntypedRpc = (
  name: string,
  args: Record<string, unknown>,
) => PromiseLike<{ data: unknown; error: { message: string } | null }>;

/** Query key para las líneas de un estado de cuenta, filtradas por cuenta bancaria. */
export const bankLinesKey = (bankAccountId: string | null) =>
  [...bankLineKeys.all, "account", bankAccountId] as const;

export function useBankStatementLines(
  bankAccountId: string | null,
  filters: BankStatementLineFilters = {},
) {
  const status = filters.status ?? "all";
  const search = filters.search?.trim() ?? "";
  const page = Math.max(1, filters.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, filters.pageSize ?? 50));
  const query = useQuery({
    queryKey: [
      ...bankLinesKey(bankAccountId),
      "page",
      { status, search, page, pageSize },
    ] as const,
    enabled: !!bankAccountId,
    staleTime: 30_000,
    queryFn: async () => {
      const rpc = supabase.rpc as unknown as UntypedRpc;
      const { data, error } = await rpc("get_bank_statement_lines_page", {
        p_bank_account_id: bankAccountId,
        p_status: status === "all" ? null : status,
        p_search: search || null,
        p_page_size: pageSize,
        p_offset: (page - 1) * pageSize,
      });
      if (error) throw error;
      const pageData = (
        data && typeof data === "object" && !Array.isArray(data) ? data : {}
      ) as BankStatementLinePageRpc;
      const rows = Array.isArray(pageData.rows) ? pageData.rows : [];
      return {
        rows: rows.map((row) => ({
          ...row,
          signed_amount: Number(row.signed_amount),
        })),
        totalCount: Number(pageData.total_count ?? 0),
      };
    },
  });
  return {
    ...query,
    data: query.data?.rows,
    totalCount: query.data?.totalCount ?? 0,
    page,
    pageSize,
  };
}

export function useBankReconciliationKpis(bankAccountId: string | null) {
  return useQuery({
    queryKey: [...bankLinesKey(bankAccountId), "kpis"] as const,
    enabled: !!bankAccountId,
    staleTime: 30_000,
    queryFn: async (): Promise<BankReconciliationKpis> => {
      const rpc = supabase.rpc as unknown as UntypedRpc;
      const { data, error } = await rpc("get_bank_reconciliation_kpis", {
        p_bank_account_id: bankAccountId,
      });
      if (error) throw error;
      const row = (
        Array.isArray(data) ? data[0] : data
      ) as BankKpiRpcRow | null;
      return {
        totalCount: Number(row?.total_count ?? 0),
        matchedCount: Number(row?.matched_count ?? 0),
        pendingCount: Number(row?.pending_count ?? 0),
        ignoredCount: Number(row?.ignored_count ?? 0),
        charges: Number(row?.charges ?? 0),
        credits: Number(row?.credits ?? 0),
      };
    },
  });
}

/**
 * F8: ¿la cuenta tiene líneas de estado de cuenta importadas?
 * Se usa para bloquear el cambio de moneda en edición (rompería el scoring FX
 * del matching). Conteo head-only, sin traer filas.
 */
export function useBankAccountHasLines(
  bankAccountId: string | null | undefined,
) {
  return useQuery({
    queryKey: [
      ...bankLineKeys.all,
      "has-lines",
      bankAccountId ?? null,
    ] as const,
    enabled: !!bankAccountId,
    staleTime: 30_000,
    queryFn: async (): Promise<boolean> => {
      const { count, error } = await supabase
        .from("bank_statement_lines")
        .select("id", { count: "exact", head: true })
        .eq("bank_account_id", bankAccountId as string);
      if (error) throw error;
      return (count ?? 0) > 0;
    },
  });
}
