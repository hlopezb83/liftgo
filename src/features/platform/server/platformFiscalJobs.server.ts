import { asUntypedRpc, HttpError, requirePlatformOperator } from "@/lib/server/adminGuards.server";
import type { CallerClient } from "@/lib/server/guards/httpError";
import type { NullableRpcArgs, PlatformRpcArgs } from "@/lib/server/guards/platformOperator.server";
import { requirePlatformSession } from "./platformSession.server";

type FiscalJobsRpcName =
  | "platform_list_fiscal_jobs"
  | "platform_get_fiscal_job"
  | "platform_list_fiscal_actions";
type FiscalJobsRpcArgs<Fn extends FiscalJobsRpcName> = Omit<
  NullableRpcArgs<PlatformRpcArgs<Fn>>,
  "p_actor" | "p_session"
>;

export async function fiscalJobsRpc<Fn extends FiscalJobsRpcName>(
  context: { userId: string; supabase: CallerClient },
  name: Fn,
  args: FiscalJobsRpcArgs<Fn>,
) {
  const session = await requirePlatformSession(context.supabase);
  const { admin } = await requirePlatformOperator(context.supabase, context.userId, "integrations.read");
  const payload = { ...args, p_actor: context.userId, p_session: session.id } as NullableRpcArgs<PlatformRpcArgs<Fn>>;
  const result = await asUntypedRpc(admin).rpc(name, payload);
  if (result.error?.code === "42501") throw new HttpError(403, "Tu acceso cambió. Actualiza la sesión.");
  if (result.error?.code === "22023") throw new HttpError(400, "Revisa el trabajo y los filtros seleccionados.");
  if (result.error) throw new HttpError(503, "No se pudo cargar el historial fiscal. Reintenta.");
  return result.data;
}
