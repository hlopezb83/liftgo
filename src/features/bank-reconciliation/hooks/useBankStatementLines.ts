import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { defineEntityQueries } from "@/lib/query/defineEntityQueries";
import { LIST_FETCH_LIMIT } from "@/lib/supabase/constants";
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

export const bankLineQueries = defineEntityQueries<
  "bank_statement_lines",
  BankStatementLine[],
  never
>("bank_statement_lines", {
  staleTime: 30_000,
  list: (filter) => async () => {
    const bankAccountId = (filter?.bankAccountId as string | null | undefined) ?? null;
    if (!bankAccountId) return [];
    const { data, error } = await supabase
      .from("bank_statement_lines")
      .select(
        "id, import_id, bank_account_id, posted_date, description, signed_amount, reference, status, matched_payment_id, matched_supplier_payment_id, suggested_payment_id, suggested_supplier_payment_id, match_score, matched_at, ignored_reason",
      )
      .eq("bank_account_id", bankAccountId)
      .order("posted_date", { ascending: false })
      .limit(LIST_FETCH_LIMIT);
    if (error) throw error;
    return (data ?? []).map((r) => ({
      ...r,
      signed_amount: Number(r.signed_amount),
    })) as BankStatementLine[];
  },
});

/** Query key para las líneas de un estado de cuenta, filtradas por cuenta bancaria. */
export const bankLinesKey = (bankAccountId: string | null) =>
  bankLineQueries.list({ bankAccountId }).queryKey;

export function useBankStatementLines(bankAccountId: string | null) {
  return useQuery({
    ...bankLineQueries.list({ bankAccountId }),
    enabled: !!bankAccountId,
  });
}

/**
 * F8: ¿la cuenta tiene líneas de estado de cuenta importadas?
 * Se usa para bloquear el cambio de moneda en edición (rompería el scoring FX
 * del matching). Conteo head-only, sin traer filas.
 */
export function useBankAccountHasLines(bankAccountId: string | null | undefined) {
  return useQuery({
    queryKey: [...bankLineQueries.keys.all, "has-lines", bankAccountId ?? null] as const,
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
