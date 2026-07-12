import { supabase } from "@/integrations/supabase/client";
import { useEntityMutation } from "@/lib/hooks/useEntityMutation";
import { notifySuccess } from "@/lib/ui/appFeedback";
import { BANK_LINES_QK } from "../useBankStatementLines";
import type { ParsedBankLine } from "../../lib/csvParsers";

interface ImportArgs {
  bankAccountId: string;
  fileName: string;
  lines: ParsedBankLine[];
  periodStart: string | null;
  periodEnd: string | null;
}

export function useImportBankStatement() {
  return useEntityMutation({
    mutationFn: async (args: ImportArgs) => {
      const { data: imp, error: impErr } = await supabase
        .from("bank_statement_imports")
        .insert({
          bank_account_id: args.bankAccountId,
          file_name: args.fileName,
          period_start: args.periodStart,
          period_end: args.periodEnd,
          lines_count: args.lines.length,
        })
        .select("id")
        .single();
      if (impErr) throw impErr;

      const rows = args.lines.map((l) => ({
        import_id: imp.id,
        bank_account_id: args.bankAccountId,
        posted_date: l.posted_date,
        description: l.description,
        signed_amount: l.signed_amount,
        reference: l.reference,
        hash: l.hash,
      }));

      const { error: insErr } = await supabase
        .from("bank_statement_lines")
        .upsert(rows, { onConflict: "bank_account_id,hash", ignoreDuplicates: true });
      if (insErr) throw insErr;

      const { data: matchRes, error: matchErr } = await supabase.rpc("match_bank_statement_lines", {
        p_import_id: imp.id,
      });
      if (matchErr) throw matchErr;
      return matchRes;
    },
    invalidateKeysFn: (_res, vars) => [BANK_LINES_QK(vars.bankAccountId)],
    errorTitle: "Error al importar estado de cuenta",
    onSuccess: (res) => {
      const summary = Array.isArray(res) && res[0] ? res[0] : null;
      if (summary) {
        notifySuccess(
          `Importación lista: ${summary.matched_count ?? 0} conciliados, ${summary.suggested_count ?? 0} sugeridos, ${summary.unmatched_count ?? 0} sin emparejar.`,
        );
      } else {
        notifySuccess("Importación completada");
      }
    },
  });
}

