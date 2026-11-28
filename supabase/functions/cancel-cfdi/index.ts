import {
  captureEdgeError,
  setVerifiedEdgeIdentity,
  wrapEdgeFunction,
} from "../_shared/edgeSentry.ts";
import { getAdminClient, getCallerClient } from "../_shared/supabaseClients.ts";
import type { SupabaseLike } from "../_shared/types.ts";
import { handleCancelCfdi } from "./handler.ts";

function handle(req: Request): Promise<Response> {
  return handleCancelCfdi(req, {
    createCallerClient: () => getCallerClient(req) as unknown as SupabaseLike,
    createServiceClient: () => getAdminClient() as unknown as SupabaseLike,
    fetchImpl: fetch,
    env: (k) => Deno.env.get(k),
    diagnostics: {
      identify: setVerifiedEdgeIdentity,
      capture: captureEdgeError,
    },
  });
}

Deno.serve(wrapEdgeFunction("cancel-cfdi", handle));
