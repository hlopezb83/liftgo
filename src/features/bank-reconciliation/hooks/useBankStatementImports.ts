import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEntityMutation } from "@/lib/hooks/useEntityMutation";
import { defineEntityQueries } from "@/lib/query/defineEntityQueries";
import { bankImportKeys, bankLineKeys } from "../lib/queryKeys";

export interface BankStatementImportRow {
  id: string;
  bank_account_id: string;
  file_name: string;
  period_start: string | null;
  period_end: string | null;
  lines_count: number;
  imported_by: string | null;
  created_at: string;
  bank_account_name: string;
  bank_account_last4: string | null;
  matched_count: number;
  total_count: number;
}

export const bankImportQueries = defineEntityQueries<
  "bank_statement_imports",
  BankStatementImportRow[],
  never
>("bank_statement_imports", {
  staleTime: 30_000,
  list: () => async () => {
    const { data: imports, error } = await supabase
      .from("bank_statement_imports")
      .select("id, bank_account_id, file_name, period_start, period_end, lines_count, imported_by, created_at, bank_accounts(name, last4)")
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw error;

    const ids = (imports ?? []).map((i) => i.id);
    if (ids.length === 0) return [];

    const { data: lines, error: linesErr } = await supabase
      .from("bank_statement_lines")
      .select("import_id, status")
      .in("import_id", ids);
    if (linesErr) throw linesErr;

    const stats = new Map<string, { matched: number; total: number }>();
    for (const l of lines ?? []) {
      const cur = stats.get(l.import_id) ?? { matched: 0, total: 0 };
      cur.total += 1;
      if (l.status === "matched") cur.matched += 1;
      stats.set(l.import_id, cur);
    }

    return (imports ?? []).map((i) => {
      const acct = i.bank_accounts as { name?: string; last4?: string | null } | null;
      const s = stats.get(i.id) ?? { matched: 0, total: 0 };
      return {
        id: i.id,
        bank_account_id: i.bank_account_id,
        file_name: i.file_name,
        period_start: i.period_start,
        period_end: i.period_end,
        lines_count: i.lines_count,
        imported_by: i.imported_by,
        created_at: i.created_at,
        bank_account_name: acct?.name ?? "—",
        bank_account_last4: acct?.last4 ?? null,
        matched_count: s.matched,
        total_count: s.total,
      };
    });
  },
});

export function useBankStatementImports() {
  return useQuery(bankImportQueries.list());
}

export function useDeleteBankImport() {
  return useEntityMutation({
    mutationFn: async (importId: string) => {
      const { error } = await supabase
        .from("bank_statement_imports")
        .delete()
        .eq("id", importId);
      if (error) throw error;
    },
    invalidateKeys: [bankImportKeys.all, bankLineKeys.all],
    successMsg: "Import eliminado",
    errorTitle: "Error al eliminar import",
  });
}
