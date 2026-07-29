import { supabase } from "@/integrations/supabase/client";
import { useEntityMutation } from "@/lib/hooks/useEntityMutation";
import { notifySuccess } from "@/lib/ui/appFeedback";
import { bankLinesKey } from "../useBankStatementLines";
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

      // R23-11: `select()` nos dice cuántas líneas eran realmente nuevas.
      const { data: inserted, error: insErr } = await supabase
        .from("bank_statement_lines")
        .upsert(rows, { onConflict: "bank_account_id,hash", ignoreDuplicates: true })
        .select("id");
      if (insErr) throw insErr;

      const insertedCount = inserted?.length ?? 0;
      if (insertedCount === 0) {
        // Reimportación del mismo archivo: no dejamos un import huérfano en 0.
        await supabase.from("bank_statement_imports").delete().eq("id", imp.id);
        return { summary: null, insertedCount: 0 };
      }

      if (insertedCount !== args.lines.length) {
        await supabase
          .from("bank_statement_imports")
          .update({ lines_count: insertedCount })
          .eq("id", imp.id);
      }

      const { data: matchRes, error: matchErr } = await supabase.rpc("match_bank_statement_lines", {
        p_import_id: imp.id,
      });
      if (matchErr) throw matchErr;
      return { summary: Array.isArray(matchRes) && matchRes[0] ? matchRes[0] : null, insertedCount };
    },
    invalidateKeysFn: (_res, vars) => [bankLinesKey(vars.bankAccountId)],
    errorTitle: "Error al importar estado de cuenta",
    onSuccess: (res) => {
      if (res.insertedCount === 0) {
        notifySuccess("Archivo ya importado: no había movimientos nuevos.");
        return;
      }
      const summary = res.summary;
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

