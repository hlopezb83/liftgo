import { satStatusLabel } from "@/features/feedback";
import { supabase } from "@/integrations/supabase/client";
import type { TablesInsert } from "@/integrations/supabase/types";
import { useEntityMutation } from "@/lib/hooks/useEntityMutation";
import { invokeEdgeFunction } from "@/lib/supabase/invokeEdgeFunction";
import { notifyInfo, notifySuccess } from "@/lib/ui/appFeedback";
import { creditNoteKeys, invoiceKeys } from "../../lib/queryKeys";

/**
 * Keys invalidadas tras cualquier mutación de nota de crédito:
 * el árbol de credit_notes + invoices (afecta saldos, status y timbrado).
 */
const CREDIT_NOTE_INVALIDATIONS = [creditNoteKeys.all, invoiceKeys.all] as const;

export function useCreateCreditNote() {
  return useEntityMutation({
    mutationFn: async (input: Omit<TablesInsert<"credit_notes">, "credit_note_number"> & { stamp?: boolean }) => {
      const { stamp, ...payload } = input;
      const { data: numberData, error: numErr } = await supabase.rpc("next_draft_credit_note_number");
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
      return { created, stamped: !!stamp };
    },
    invalidateKeys: CREDIT_NOTE_INVALIDATIONS,
    errorTitle: "Error al crear nota de crédito",
    // Toast condicional según si se timbró — no encaja en `successMsg` fijo.
    onSuccess: ({ stamped }) => {
      notifySuccess(stamped ? "Nota de crédito timbrada" : "Nota de crédito creada");
    },
  });
}

export function useStampCreditNote() {
  return useEntityMutation({
    mutationFn: async (creditNoteId: string) => {
      return await invokeEdgeFunction("stamp-credit-note", {
        body: { credit_note_id: creditNoteId },
      });
    },
    invalidateKeys: CREDIT_NOTE_INVALIDATIONS,
    successMsg: "Nota de crédito timbrada",
    errorTitle: "Error al timbrar nota de crédito",
  });
}

export function useCancelCreditNote() {
  return useEntityMutation({
    mutationFn: async (input: { creditNoteId: string; motive: string; substitutionUuid?: string | null }) => {
      return await invokeEdgeFunction<{ cancellation_status: string }>(
        "cancel-credit-note",
        {
          body: {
            credit_note_id: input.creditNoteId,
            motive: input.motive,
            substitution_uuid: input.substitutionUuid ?? undefined,
          },
        },
      );
    },
    invalidateKeys: CREDIT_NOTE_INVALIDATIONS,
    errorTitle: "Error al cancelar nota de crédito",
    // El SAT puede devolver `accepted`, `in_progress`, etc. — mostramos toast
    // diferenciado según el estado real de la cancelación.
    onSuccess: (data) => {
      const s = data?.cancellation_status;
      if (s === "accepted") notifySuccess("Nota de crédito cancelada");
      else notifyInfo(satStatusLabel(s));
    },
  });
}

export function useDeleteCreditNote() {
  return useEntityMutation({
    mutationFn: async (creditNoteId: string) => {
      const { error } = await supabase.from("credit_notes").delete().eq("id", creditNoteId);
      if (error) throw error;
    },
    invalidateKeys: [creditNoteKeys.all],
    successMsg: "Nota de crédito eliminada",
    errorTitle: "Error al eliminar",
  });
}
