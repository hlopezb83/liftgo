import {
  handleValidateCustomers,
  type SupabaseLike,
} from "./handler.ts";
import { getAdminClient, getCallerClient } from "../_shared/supabaseClients.ts";

Deno.serve((req) =>
  handleValidateCustomers(req, {
    createCallerClient: () => getCallerClient(req) as unknown as never,
    createServiceClient: () => getAdminClient() as unknown as SupabaseLike,
    fetchImpl: fetch,
    env: (k) => Deno.env.get(k),
  })
);
