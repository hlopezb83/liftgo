// Pure handler for stamp-payment-complement, deps-injected for testability.
// Multiempresa · Fase 1: la organización se valida contra el pago leído de
// BD ANTES de cualquier claim, update o llamada al PAC.
import { handleCors } from "../_shared/cors.ts";
import {
  createRequestDiagnostics,
  type EdgeDiagnostics,
} from "../_shared/edgeDiagnostics.ts";
import { jsonError } from "../_shared/http.ts";
import type { SupabaseLike } from "../_shared/types.ts";
import {
  requireRoleDI,
  type StampPaymentComplementDeps as BaseStampPaymentComplementDeps,
} from "./repAuth.ts";
import { executeRepPacAndPersist } from "./repPacAndPersistence.ts";
import { buildRepPayload } from "./repPayload.ts";
import { claimAndPrepareRep } from "./repPreparation.ts";

export type StampPaymentComplementDeps = BaseStampPaymentComplementDeps & {
  diagnostics?: EdgeDiagnostics;
};
export type { SupabaseLike };

export async function handleStampPaymentComplement(
  req: Request,
  deps: StampPaymentComplementDeps,
): Promise<Response> {
  const corsRes = handleCors(req);
  if (corsRes) return corsRes;
  const diag = createRequestDiagnostics(deps.diagnostics);

  try {
    const auth = await requireRoleDI(req, deps, ["admin", "administrativo"]);
    if (!auth.ok) return jsonError(req, auth.status, auth.message);
    diag.authenticated({ userId: auth.userId });
    const supabase = auth.supabase;

    const { payment_id } = await req.json().catch(() => ({}));
    const prepared = await claimAndPrepareRep({
      req,
      supabase,
      userId: auth.userId,
      paymentIdRaw: payment_id,
      env: deps.env,
    });
    if (!prepared.ok) return prepared.response;
    diag.organization(prepared.data.organizationId);

    const built = await buildRepPayload(req, prepared.data);
    if (!built.ok) return built.response;

    return await executeRepPacAndPersist({
      req,
      supabase,
      ctx: prepared.data,
      payload: built.payload,
    });
  } catch (err) {
    diag.capture(err, 500, "stamp_rep_unhandled");
    console.error("stamp-payment-complement error:", err);
    return jsonError(req, 500, "Internal server error");
  }
}
