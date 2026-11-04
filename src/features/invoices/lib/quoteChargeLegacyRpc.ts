import { supabase } from "@/integrations/supabase/client";

/**
 * Typed contract for the historical quote-charge review RPCs (migration 0123).
 * The generated Supabase types only include functions that exist in the live
 * database, so they disappear until 0123 is applied. This local contract keeps
 * the preview type-safe without editing the auto-generated types file.
 */
type LegacyReviewRpcs = {
  get_quote_charge_legacy_review: { p_quote_id: string };
  reconcile_quote_charge_history: {
    p_quote_id: string;
    p_invoice_id: string;
    p_line_index: number;
    p_expected_hash: string;
    p_classification: string;
    p_quote_line_id: string | null;
    p_quantity: number | null;
    p_reason: string;
    p_evidence: string;
    p_request_key: string;
  };
  reverse_quote_charge_history: {
    p_review_id: string;
    p_reason: string;
    p_evidence: string;
    p_request_key: string;
  };
};

type RpcResult = { data: unknown; error: { message: string; code?: string } | null };
type UntypedRpc = (fn: string, args: Record<string, unknown>) => PromiseLike<RpcResult>;

export async function callLegacyReviewRpc<K extends keyof LegacyReviewRpcs>(
  fn: K,
  args: LegacyReviewRpcs[K],
): Promise<RpcResult> {
  // Same authenticated client and session; only the compile-time name list differs.
  const rpc = supabase.rpc.bind(supabase) as unknown as UntypedRpc;
  return rpc(fn, args);
}
