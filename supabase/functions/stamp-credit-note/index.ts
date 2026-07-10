import type { SupabaseLike } from "./handler.ts";
import { handleStampCreditNote } from "./handler.ts";
import { getAdminClient, getCallerClient } from "../_shared/supabaseClients.ts";

Deno.serve((req) =>
  handleStampCreditNote(req, {
    createCallerClient: () => getCallerClient(req) as unknown as SupabaseLike,
    createServiceClient: () => getAdminClient() as unknown as SupabaseLike,
    fetchImpl: fetch,
    env: (k) => Deno.env.get(k),
  })
);
