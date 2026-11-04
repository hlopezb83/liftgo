import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { invoiceKeys } from "../../lib/queryKeys";
import { parseLegacyChargeReview, type LegacyClassification } from "../../lib/quoteChargeLegacyReview";

export type LegacyReviewInput = {
  invoiceId: string;
  lineIndex: number;
  expectedHash: string;
  classification: LegacyClassification;
  quoteLineId: string | null;
  quantity: number | null;
  reason: string;
  evidence: string;
  requestKey: string;
};
export type LegacyReverseInput = { reviewId: string; reason: string; evidence: string; requestKey: string };

const resultSchema = z.object({ complete: z.literal(true), review_id: z.string().uuid(), already_existed: z.boolean() });
function assertComplete(data: unknown, reversal = false) {
  const schema = reversal ? resultSchema.extend({ reversal_id: z.string().uuid() }) : resultSchema;
  if (!schema.safeParse(data).success) {
    throw new Error("El servidor no confirmó el resultado. Reintenta la misma solicitud para verificarla sin duplicar la revisión.");
  }
}

export function useQuoteChargeLegacyReview(quoteId: string, enabled: boolean) {
  const queryClient = useQueryClient();
  const queryKey = [...invoiceKeys.all, "quote-charge-legacy-review", quoteId];
  const query = useQuery({
    queryKey,
    enabled,
    staleTime: 0,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_quote_charge_legacy_review", { p_quote_id: quoteId });
      if (error) throw error;
      return parseLegacyChargeReview(data, quoteId);
    },
  });
  const refresh = async () => {
    // Both availability and recurring previews may have cached the old balance.
    await queryClient.invalidateQueries({ queryKey: invoiceKeys.all });
  };
  const reconcile = useMutation({
    retry: false,
    mutationFn: async (input: LegacyReviewInput) => {
      const { data, error } = await supabase.rpc("reconcile_quote_charge_history", {
        p_quote_id: quoteId, p_invoice_id: input.invoiceId,
        p_line_index: input.lineIndex, p_expected_hash: input.expectedHash,
        p_classification: input.classification, p_quote_line_id: input.quoteLineId,
        p_quantity: input.quantity, p_reason: input.reason, p_evidence: input.evidence,
        p_request_key: input.requestKey,
      });
      if (error) throw error;
      assertComplete(data);
    },
    onSuccess: refresh,
  });
  const reverse = useMutation({
    retry: false,
    mutationFn: async (input: LegacyReverseInput) => {
      const { data, error } = await supabase.rpc("reverse_quote_charge_history", {
        p_review_id: input.reviewId, p_reason: input.reason,
        p_evidence: input.evidence, p_request_key: input.requestKey,
      });
      if (error) throw error;
      assertComplete(data, true);
    },
    onSuccess: refresh,
  });
  return { ...query, reconcile, reverse };
}
