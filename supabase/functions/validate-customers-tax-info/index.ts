import type { CallerLike } from "../_shared/authWithDeps.ts";
import {
  captureEdgeError,
  setVerifiedEdgeIdentity,
  wrapEdgeFunction,
} from "../_shared/edgeSentry.ts";
import { getAdminClient, getCallerClient } from "../_shared/supabaseClients.ts";
import { handleValidateCustomers, type SupabaseLike } from "./handler.ts";

function handle(req: Request): Promise<Response> {
  return handleValidateCustomers(req, {
    createCallerClient: () => getCallerClient(req) as unknown as CallerLike,
    createServiceClient: () => getAdminClient() as unknown as SupabaseLike,
    fetchImpl: fetch,
    env: (k) => Deno.env.get(k),
    diagnostics: {
      identify: setVerifiedEdgeIdentity,
      capture: captureEdgeError,
    },
  });
}

Deno.serve(wrapEdgeFunction("validate-customers-tax-info", handle));
