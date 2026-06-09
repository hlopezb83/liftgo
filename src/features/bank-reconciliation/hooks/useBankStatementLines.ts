import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
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

export const BANK_LINES_QK = (accountId: string | null) => ["bank_statement_lines", accountId] as const;

export function useBankStatementLines(bankAccountId: string | null) {
  return useQuery({
    enabled: !!bankAccountId,
    queryKey: BANK_LINES_QK(bankAccountId),
    staleTime: 30_000,
    queryFn: async (): Promise<BankStatementLine[]> => {
      if (!bankAccountId) return [];
      const { data, error } = await supabase
        .from("bank_statement_lines")
        .select(
          "id, import_id, bank_account_id, posted_date, description, signed_amount, reference, status, matched_payment_id, matched_supplier_payment_id, suggested_payment_id, suggested_supplier_payment_id, match_score, matched_at, ignored_reason",
        )
        .eq("bank_account_id", bankAccountId)
        .order("posted_date", { ascending: false });
      if (error) throw error;
      return (data ?? []).map((r) => ({
        ...r,
        signed_amount: Number(r.signed_amount),
      })) as BankStatementLine[];
    },
  });
}
