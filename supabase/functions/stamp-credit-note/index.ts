import {
  captureEdgeError,
  setVerifiedEdgeIdentity,
  wrapEdgeFunction,
} from "../_shared/edgeSentry.ts";
import { getAdminClient, getCallerClient } from "../_shared/supabaseClients.ts";
import { handleStampCreditNote, type SupabaseLike } from "./handler.ts";

function handle(req: Request): Promise<Response> {
  return handleStampCreditNote(req, {
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

Deno.serve(wrapEdgeFunction("stamp-credit-note", handle));
