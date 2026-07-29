import { supabase } from "@/integrations/supabase/client";
import { useEntityMutation } from "@/lib/hooks/useEntityMutation";
import { notifySuccess, notifyWarning } from "@/lib/ui/appFeedback";
import { bankLinesKey } from "../useBankStatementLines";

interface ConfirmManyResult {
  confirmed: number;
  failed: number;
}

/** Confirma en bloque todas las líneas sugeridas seleccionadas (éxito parcial permitido). */
export function useConfirmBankMatches() {
  return useEntityMutation<{ lineIds: string[]; bankAccountId: string }, ConfirmManyResult>({
    mutationFn: async (args) => {
      const { data, error } = await supabase.rpc("confirm_bank_matches", {
        p_line_ids: args.lineIds,
      });
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : null;
      return { confirmed: Number(row?.confirmed ?? 0), failed: Number(row?.failed ?? 0) };
    },
    invalidateKeysFn: (_d, vars) => [bankLinesKey(vars.bankAccountId)],
    errorTitle: "No se pudieron conciliar los movimientos",
    onSuccess: (res) => {
      if (res.failed > 0) {
        notifyWarning(
          `${res.confirmed} conciliados. ${res.failed} quedaron sin emparejar porque su sugerencia ya no era válida.`,
        );
        return;
      }
      notifySuccess(`${res.confirmed} movimientos conciliados`);
    },
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
