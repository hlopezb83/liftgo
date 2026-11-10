// Entrada del ejecutor temporal. NO está en supabase/functions: no se
// despliega hasta su revisión (ver README, "Plan de despliegue").
import {
  getAdminClient,
  getCallerClient,
} from "../snapshot/supabase/functions/_shared/supabaseClients.ts";
import { handleRunner } from "./preflight.ts";
import type { CallerClientLike } from "./db.ts";
import type { SupabaseLike } from "../snapshot/supabase/functions/_shared/types.ts";

Deno.serve((req) =>
  handleRunner(req, {
    createCallerClient: () =>
      getCallerClient(req) as unknown as CallerClientLike,
    createServiceClient: () => getAdminClient() as unknown as SupabaseLike,
    env: (k) => Deno.env.get(k),
    now: () => Date.now(),
  })
);
