import { z } from "zod";
import { fiscalActionStatusSchema, type FiscalActionInput } from "@/lib/platformFiscalActions.types";
import { asUntypedRpc, enforceRateLimit, HttpError, requirePlatformOperator } from "./adminGuards.server";
import { requirePlatformSession } from "./guards/platformSession.server";
import { lookupPlatformFiscalDocument } from "./platformFiscalLookup.server";
import type { CallerClient } from "./guards/httpError";

const reservationSchema = z.discriminatedUnion("started", [
  z.object({ started: z.literal(false), status: fiscalActionStatusSchema }),
  z.object({ started: z.literal(true), apiKey: z.string(), mode: z.enum(["test", "live"]), documentId: z.uuid(), knownId: z.string().nullable() }),
]);
function checkRpcError(error: { code?: string } | null) {
  if (!error) return;
  if (error.code === "42501") throw new HttpError(403, "Tu acceso cambió. Actualiza la sesión.");
  if (error.code === "40001") throw new HttpError(409, "El trabajo cambió. Actualiza el historial antes de continuar.");
  if (error.code === "P0001") throw new HttpError(429, "El trabajo está en proceso o se consultó recientemente. Actualiza y espera un minuto.");
  if (error.code === "22023") throw new HttpError(400, "No se puede consultar este trabajo: verifica empresa, documento y configuración histórica de Facturapi.");
  throw new HttpError(503, "No se pudo guardar la consulta fiscal. Actualiza el historial antes de repetir.");
}
export async function performPlatformFiscalAction(context: { userId: string; supabase: CallerClient }, input: FiscalActionInput) {
  const session = await requirePlatformSession(context.supabase);
  const { admin } = await requirePlatformOperator(context.supabase, context.userId, "integrations.retry");
  await enforceRateLimit(admin, "platform-fiscal-action", context.userId, 5, 60);
  const rpc = asUntypedRpc(admin);
  const authority = { p_actor: context.userId, p_session: session.id };
  const claim = await rpc.rpc("platform_begin_fiscal_action", { ...authority, p_job: input.jobId, p_request: input.requestId,
    p_revision: input.revision, p_intent: input.intent, p_reason: input.reason });
  checkRpcError(claim.error);
  const reservation = reservationSchema.safeParse(claim.data);
  if (!reservation.success) throw new HttpError(503, "No se pudo iniciar la consulta fiscal. Actualiza antes de repetir.");
  if (!reservation.data.started) return { status: reservation.data.status };
  const result = await lookupPlatformFiscalDocument(reservation.data);
  const complete = await rpc.rpc("platform_complete_fiscal_action", { ...authority, p_request: input.requestId,
    p_outcome: result.outcome, p_provider_id: result.providerId, p_uuid: result.uuid, p_cancellation: result.cancellation,
    p_folio: result.folio, p_series: result.series });
  checkRpcError(complete.error);
  const status = fiscalActionStatusSchema.safeParse(complete.data);
  if (!status.success) throw new HttpError(503, "La consulta terminó pero no se confirmó su guardado. Actualiza el historial.");
  return { status: status.data };
}
