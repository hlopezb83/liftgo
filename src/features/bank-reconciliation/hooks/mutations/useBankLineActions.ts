import { supabase } from "@/integrations/supabase/client";
import { useEntityMutation } from "@/lib/hooks/useEntityMutation";
import { bankLinesKey } from "../useBankStatementLines";

export function useConfirmBankMatch() {
  return useEntityMutation<
    {
      lineId: string;
      bankAccountId: string;
      paymentId?: string;
      supplierPaymentId?: string;
    },
    void
  >({
    mutationFn: async (args) => {
      const { error } = await supabase.rpc("confirm_bank_match", {
        p_line_id: args.lineId,
        p_payment_id: args.paymentId ?? undefined,
        p_supplier_payment_id: args.supplierPaymentId ?? undefined,
      });
      if (error) throw error;
    },
    invalidateKeysFn: (_d, vars) => [bankLinesKey(vars.bankAccountId)],
    successMsg: "Movimiento conciliado",
    errorTitle: "No se pudo conciliar el movimiento",
  });
}

export function useUnmatchBankLine() {
  return useEntityMutation<{ lineId: string; bankAccountId: string }, void>({
    mutationFn: async (args) => {
      const { error } = await supabase.rpc("unmatch_bank_line", { p_line_id: args.lineId });
      if (error) throw error;
    },
    invalidateKeysFn: (_d, vars) => [bankLinesKey(vars.bankAccountId)],
    successMsg: "Movimiento desemparejado",
    errorTitle: "No se pudo desemparejar el movimiento",
  });
}

export function useIgnoreBankLine() {
  return useEntityMutation<{ lineId: string; bankAccountId: string; reason: string }, void>({
    mutationFn: async (args) => {
      const { error } = await supabase
        .from("bank_statement_lines")
        .update({ status: "ignored", ignored_reason: args.reason })
        .eq("id", args.lineId);
      if (error) throw error;
    },
    invalidateKeysFn: (_d, vars) => [bankLinesKey(vars.bankAccountId)],
    successMsg: "Movimiento marcado como ignorado",
    errorTitle: "No se pudo marcar el movimiento como ignorado",
  });
}
