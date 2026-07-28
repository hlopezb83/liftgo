import { supabase } from "@/integrations/supabase/client";
import { useEntityMutation } from "@/lib/hooks/useEntityMutation";
import { bankLinesKey } from "../useBankStatementLines";

/** Confirma en bloque todas las líneas sugeridas seleccionadas. */
export function useConfirmBankMatches() {
  return useEntityMutation<{ lineIds: string[]; bankAccountId: string }, number>({
    mutationFn: async (args) => {
      const { data, error } = await supabase.rpc("confirm_bank_matches", {
        p_line_ids: args.lineIds,
      });
      if (error) throw error;
      return Number(data ?? 0);
    },
    invalidateKeysFn: (_d, vars) => [bankLinesKey(vars.bankAccountId)],
    successMsg: "Movimientos conciliados",
    errorTitle: "No se pudieron conciliar los movimientos",
  });
}

/** Marca varias líneas como ignoradas con la misma razón. */
export function useIgnoreBankLines() {
  return useEntityMutation<{ lineIds: string[]; bankAccountId: string; reason: string }, number>({
    mutationFn: async (args) => {
      const { data, error } = await supabase.rpc("ignore_bank_lines", {
        p_line_ids: args.lineIds,
        p_reason: args.reason,
      });
      if (error) throw error;
      return Number(data ?? 0);
    },
    invalidateKeysFn: (_d, vars) => [bankLinesKey(vars.bankAccountId)],
    successMsg: "Movimientos ignorados",
    errorTitle: "No se pudieron ignorar los movimientos",
  });
}
