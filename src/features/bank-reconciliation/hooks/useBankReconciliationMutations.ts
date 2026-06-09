import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { notifyError } from "@/lib/ui/appFeedback";
import type { ParsedBankLine } from "../lib/csvParsers";
import { BANK_LINES_QK } from "./useBankStatementLines";

interface ImportArgs {
  bankAccountId: string;
  fileName: string;
  lines: ParsedBankLine[];
  periodStart: string | null;
  periodEnd: string | null;
}

export function useImportBankStatement() {
  const qc = useQueryClient();
  return useMutation({
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

      // Insert ignorando duplicados (índice único sobre account_id + hash)
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
    onSuccess: (res, vars) => {
      qc.invalidateQueries({ queryKey: BANK_LINES_QK(vars.bankAccountId) });
      const summary = Array.isArray(res) && res[0] ? res[0] : null;
      if (summary) {
        toast.success(
          `Importación lista: ${summary.matched_count ?? 0} conciliados, ${summary.suggested_count ?? 0} sugeridos, ${summary.unmatched_count ?? 0} sin emparejar.`,
        );
      } else {
        toast.success("Importación completada");
      }
    },
    onError: (e: Error) => notifyError({ error: e, message: e.message }),
  });
}

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
