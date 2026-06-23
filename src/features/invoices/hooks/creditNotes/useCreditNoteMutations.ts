import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { invokeEdgeFunction } from "@/lib/supabase/invokeEdgeFunction";
import { notifyError } from "@/lib/ui/appFeedback";
import { toast } from "sonner";
import type { TablesInsert } from "@/integrations/supabase/types";

import { creditNoteKeys, invoiceKeys } from "../../lib/queryKeys";
function invalidateCreditNotes(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: creditNoteKeys.all });
  qc.invalidateQueries({ queryKey: invoiceKeys.all });
}

export function useCreateCreditNote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: Omit<TablesInsert<"credit_notes">, "credit_note_number"> & { stamp?: boolean }) => {
      const { stamp, ...payload } = input;
      const { data: numberData, error: numErr } = await supabase.rpc("next_credit_note_number");
      if (numErr) throw numErr;
      const insertPayload: TablesInsert<"credit_notes"> = {
        ...payload,
        credit_note_number: numberData as string,
      };
      const { data: created, error } = await supabase
        .from("credit_notes")
        .insert(insertPayload)
        .select()
        .single();
      if (error) throw error;
      if (stamp) {
        await invokeEdgeFunction("stamp-credit-note", {
          body: { credit_note_id: created.id },
        });
      }
      return created;
    },
    onSuccess: (_d, vars) => {
      toast.success(vars.stamp ? "Nota de crédito timbrada" : "Nota de crédito creada");
      invalidateCreditNotes(qc);
    },
    onError: (err) => notifyError({ error: err, message: "Error al crear nota de crédito" }),
  });
}

export function useStampCreditNote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (creditNoteId: string) => {
      const { data, error } = await supabase.functions.invoke("stamp-credit-note", {
        body: { credit_note_id: creditNoteId },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: () => {
      toast.success("Nota de crédito timbrada");
      invalidateCreditNotes(qc);
    },
    onError: (err) => notifyError({ error: err, message: "Error al timbrar nota de crédito" }),
  });
}

export function useCancelCreditNote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { creditNoteId: string; motive: string; substitutionUuid?: string | null }) => {
      const { data, error } = await supabase.functions.invoke("cancel-credit-note", {
        body: {
          credit_note_id: input.creditNoteId,
          motive: input.motive,
          substitution_uuid: input.substitutionUuid ?? undefined,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data as { cancellation_status: string };
    },
    onSuccess: (data) => {
      const s = data?.cancellation_status;
      if (s === "accepted") toast.success("Nota de crédito cancelada");
      else if (s === "pending") toast.info("Cancelación pendiente de aceptación SAT");
      else toast.info(`Estado SAT: ${s}`);
      invalidateCreditNotes(qc);
    },
    onError: (err) => notifyError({ error: err, message: "Error al cancelar nota de crédito" }),
  });
}

export function useDeleteCreditNote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (creditNoteId: string) => {
      const { error } = await supabase.from("credit_notes").delete().eq("id", creditNoteId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Nota de crédito eliminada");
      qc.invalidateQueries({ queryKey: creditNoteKeys.all });
    },
    onError: (err) => notifyError({ error: err, message: "Error al eliminar" }),
  });
}
