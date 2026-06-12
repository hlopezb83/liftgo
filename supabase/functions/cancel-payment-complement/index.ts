import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { handleCancelPaymentComplement, type SupabaseLike } from "./handler.ts";

Deno.serve((req) =>
  handleCancelPaymentComplement(req, {
    createCallerClient: (authHeader) =>
      createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_ANON_KEY")!,
        { global: { headers: { Authorization: authHeader } } },
      ) as unknown as SupabaseLike,
    createServiceClient: () =>
      createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      ) as unknown as SupabaseLike,
    fetchImpl: fetch,
    env: (k) => Deno.env.get(k),
  })
);
