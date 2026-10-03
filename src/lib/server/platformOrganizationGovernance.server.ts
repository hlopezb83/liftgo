import type { PlatformCapability } from "@/lib/platformAccess.types";
import { asUntypedRpc, HttpError, requirePlatformOperator, type CallerClient } from "./adminGuards.server";
import { requirePlatformSession } from "./guards/platformSession.server";

type Context = { userId: string; supabase: CallerClient };
/** Actor y sesión proceden de Auth; el RPC vuelve a verificar su autoridad actual. */
export async function organizationGovernanceRpc(
  context: Context, name: string, capability: PlatformCapability, args: Record<string, unknown> = {},
): Promise<unknown> {
  const session = await requirePlatformSession(context.supabase);
  const { admin } = await requirePlatformOperator(context.supabase, context.userId, capability);
  const result = await asUntypedRpc(admin).rpc(name, { ...args, p_actor: context.userId, p_session: session.id });
  if (!result.error) return result.data;
  const code = result.error.code;
  if (code === "40001" || code === "40P01") throw new HttpError(409, "Los datos cambiaron. Tu captura se conserva; revisa la ficha actual antes de guardar.");
  if (code === "42501") throw new HttpError(403, "Tu sesión o permiso ya no permite esta operación.");
  if (code === "22023") throw new HttpError(400, "Revisa la clasificación, el contacto y el motivo.");
  if (code === "P0002") throw new HttpError(404, "La empresa ya no está disponible.");
  throw new HttpError(503, "No se pudieron consultar o guardar los datos de la empresa. Reintenta.");
}
