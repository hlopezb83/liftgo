import {
  type CancelCreditNoteDeps,
  handleCancelCreditNote,
  type SupabaseLike,
} from "./handler.ts";
import { getAdminClient, getCallerClient } from "../_shared/supabaseClients.ts";

Deno.serve((req) =>
  handleCancelCreditNote(req, {
    createCallerClient: () => getCallerClient(req) as unknown as SupabaseLike,
    createServiceClient: () => getAdminClient() as unknown as SupabaseLike,
    fetchImpl: fetch,
    env: (k) => Deno.env.get(k),
  } as CancelCreditNoteDeps)
);
