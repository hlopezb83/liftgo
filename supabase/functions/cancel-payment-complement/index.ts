import { wrapEdgeFunction } from "../_shared/edgeSentry.ts";
import { getAdminClient, getCallerClient } from "../_shared/supabaseClients.ts";
import { handleCancelPaymentComplement, type SupabaseLike } from "./handler.ts";

function handle(req: Request): Promise<Response> {
  return handleCancelPaymentComplement(req, {
    createCallerClient: () => getCallerClient(req) as unknown as SupabaseLike,
    createServiceClient: () => getAdminClient() as unknown as SupabaseLike,
    fetchImpl: fetch,
    env: (k) => Deno.env.get(k),
  });
}

Deno.serve(wrapEdgeFunction("cancel-payment-complement", handle));
