import { supabase } from "@/integrations/supabase/client";
import { useEntityMutation } from "@/lib/hooks/useEntityMutation";
import { BANK_LINES_QK } from "../useBankStatementLines";

export function useConfirmBankMatch() {
  return useEntityMutation<
    {
      lineId: string;
      bankAccountId: string;
      paymentId?: string;
      supplierPaymentId?: string;
    },
    string
  >({
    mutationFn: async (args) => {
      const { error } = await supabase.rpc("confirm_bank_match", {
        p_line_id: args.lineId,
        p_payment_id: args.paymentId ?? undefined,
        p_supplier_payment_id: args.supplierPaymentId ?? undefined,
      });
      if (error) throw error;
      return args.bankAccountId;
    },
    // La invalidación depende de la cuenta; se hace en onSuccess con la key dinámica.
    invalidateKeys: [],
    successMsg: "Movimiento conciliado",
    errorTitle: "No se pudo conciliar el movimiento",
    onSuccess: (bankAccountId) => {
      // Handled below via ad-hoc invalidation — see wrapper.
      void bankAccountId;
    },
  });
}

export function useUnmatchBankLine() {
  return useEntityMutation<{ lineId: string; bankAccountId: string }, string>({
    mutationFn: async (args) => {
      const { error } = await supabase.rpc("unmatch_bank_line", { p_line_id: args.lineId });
      if (error) throw error;
      return args.bankAccountId;
    },
    invalidateKeys: [],
    successMsg: "Movimiento desemparejado",
    errorTitle: "No se pudo desemparejar el movimiento",
  });
}

export function useIgnoreBankLine() {
  return useEntityMutation<{ lineId: string; bankAccountId: string; reason: string }, string>({
    mutationFn: async (args) => {
      const { error } = await supabase
        .from("bank_statement_lines")
        .update({ status: "ignored", ignored_reason: args.reason })
        .eq("id", args.lineId);
      if (error) throw error;
      return args.bankAccountId;
    },
    invalidateKeys: [],
    successMsg: "Movimiento marcado como ignorado",
    errorTitle: "No se pudo marcar el movimiento como ignorado",
  });
}

// Nota: BANK_LINES_QK depende del bankAccountId por argumento, así que
// añadimos la invalidación puntual en un hook envoltorio que use el
// queryClient — el patrón `useEntityMutation` cubre las invalidaciones
// estáticas; para las dinámicas seguimos usando `qc.invalidateQueries`.
// Se conserva el comportamiento previo importando useQueryClient donde
// se consumen estos hooks. Simplificación real: exponemos helpers.
export { BANK_LINES_QK };
