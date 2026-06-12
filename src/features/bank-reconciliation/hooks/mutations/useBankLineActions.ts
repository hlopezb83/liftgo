import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { notifyError } from "@/lib/ui/appFeedback";
import { BANK_LINES_QK } from "../useBankStatementLines";

export function useConfirmBankMatch() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: {
      lineId: string;
      bankAccountId: string;
      paymentId?: string;
      supplierPaymentId?: string;
    }) => {
      const { error } = await supabase.rpc("confirm_bank_match", {
        p_line_id: args.lineId,
        p_payment_id: args.paymentId ?? undefined,
        p_supplier_payment_id: args.supplierPaymentId ?? undefined,
      });
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: BANK_LINES_QK(vars.bankAccountId) });
      toast.success("Movimiento conciliado");
    },
    onError: (e: Error) => notifyError({ error: e, message: e.message }),
  });
}

export function useUnmatchBankLine() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { lineId: string; bankAccountId: string }) => {
      const { error } = await supabase.rpc("unmatch_bank_line", { p_line_id: args.lineId });
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: BANK_LINES_QK(vars.bankAccountId) });
      toast.success("Movimiento desemparejado");
    },
    onError: (e: Error) => notifyError({ error: e, message: e.message }),
  });
}

export function useIgnoreBankLine() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { lineId: string; bankAccountId: string; reason: string }) => {
      const { error } = await supabase
        .from("bank_statement_lines")
        .update({ status: "ignored", ignored_reason: args.reason })
        .eq("id", args.lineId);
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: BANK_LINES_QK(vars.bankAccountId) });
      toast.success("Movimiento marcado como ignorado");
    },
    onError: (e: Error) => notifyError({ error: e, message: e.message }),
  });
}
