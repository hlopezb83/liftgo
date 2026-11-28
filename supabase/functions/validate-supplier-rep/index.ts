// Endpoint heredado: la ruta preferida es src/lib/supplierRep.functions.ts.
// Se conserva endurecido (alcance por empresa) para consumidores antiguos.
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.118.0";
import { enforceRateLimit, requireRole } from "../_shared/auth.ts";
import {
  captureEdgeError,
  setVerifiedEdgeIdentity,
  wrapEdgeFunction,
} from "../_shared/edgeSentry.ts";
import type { SupabaseLike } from "../_shared/types.ts";
import { handleValidateSupplierRep } from "./handler.ts";

// Reexportados para las pruebas y consumidores existentes.
export {
  extractAllAttr,
  extractAttr,
  extractPagoNodes,
  isWellFormedXml,
} from "./handler.ts";

function handle(req: Request): Promise<Response> {
  return handleValidateSupplierRep(req, {
    authenticate: async (request, roles) => {
      const auth = await requireRole(request, roles);
      if (!auth.ok) return { ok: false, response: auth.response };
      return {
        ok: true,
        userId: auth.userId,
        role: auth.role,
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
    diagnostics: {
      identify: setVerifiedEdgeIdentity,
      capture: captureEdgeError,
    },
  });
}

Deno.serve(wrapEdgeFunction("validate-supplier-rep", handle));
