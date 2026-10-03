import { asUntypedRpc, HttpError, requirePlatformOperator } from "./adminGuards.server";
import { requirePlatformSession } from "./guards/platformSession.server";
import type { CallerClient } from "./guards/httpError";

export async function fiscalJobsRpc(context: { userId: string; supabase: CallerClient }, name: string, args: Record<string, unknown>) {
  const session = await requirePlatformSession(context.supabase);
  const { admin } = await requirePlatformOperator(context.supabase, context.userId, "integrations.read");
  const result = await asUntypedRpc(admin).rpc(name, { ...args, p_actor: context.userId, p_session: session.id });
  if (result.error?.code === "42501") throw new HttpError(403, "Tu acceso cambió. Actualiza la sesión.");
  if (result.error?.code === "22023") throw new HttpError(400, "Revisa el trabajo y los filtros seleccionados.");
  if (result.error) throw new HttpError(503, "No se pudo cargar el historial fiscal. Reintenta.");
  return result.data;
}
