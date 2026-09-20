// Endpoint heredado: la ruta preferida es src/lib/feedbackAi.functions.ts.
// Se conserva endurecido (alcance por empresa) para consumidores antiguos.
import { aiChatCompletion } from "../_shared/ai.ts";
import { enforceRateLimit, requireRole } from "../_shared/auth.ts";
import type { SupabaseLike } from "../_shared/types.ts";
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { handleClassifyFeedbackReport } from "./handler.ts";

Deno.serve((req) =>
  handleClassifyFeedbackReport(req, {
    authenticate: async (request, roles) => {
      const auth = await requireRole(request, roles);
      if (!auth.ok) return { ok: false, response: auth.response };
      return {
        ok: true,
        userId: auth.userId,
        adminClient: auth.adminClient as unknown as SupabaseLike,
      };
    },
    enforceRateLimit: (request, admin, bucket, id, max, windowSeconds) =>
      enforceRateLimit(
        request,
        admin as unknown as SupabaseClient,
        bucket,
        id,
        max,
        windowSeconds,
      ),
    aiChat: aiChatCompletion,
  })
);
