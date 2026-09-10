import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

type RpcName =
  | keyof Database["public"]["Functions"]
  | "complete_delivery"
  | "get_cash_flow_recurring_bookings"
  | "get_feedback_reports_by_status"
  | "get_sale_available_forklifts";

/**
 * Typed wrapper around supabase.rpc that lets callers declare the expected
 * shape without sprinkling `as unknown as T` casts in every domain hook.
 *
 * The Supabase generated types model RPC return types loosely (often as
 * `Json`), so we deliberately accept a generic and perform a single,
 * documented narrowing inside this helper.
 */
export async function callRpc<TResult>(
  fn: RpcName,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  args?: Record<string, any>,
): Promise<TResult> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase.rpc.bind(supabase) as any)(fn, args ?? {});
  if (error) throw error;
  return data as TResult;
}
