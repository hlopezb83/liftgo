import type { PlatformCapability } from "@/lib/auth/platformAccess.types";
import { asUntypedRpc, HttpError, requirePlatformOperator } from "@/lib/server/adminGuards.server";
import type { CallerClient } from "@/lib/server/guards/httpError";
import type { NullableRpcArgs, PlatformRpcArgs } from "@/lib/server/guards/platformOperator.server";
import { requirePlatformSession } from "./platformSession.server";

type Context = { userId: string; supabase: CallerClient };
type SupportRpcName = "platform_list_support" | "platform_get_support" | "platform_update_support";
type SupportRpcArgs<Fn extends SupportRpcName> = Omit<
  NullableRpcArgs<PlatformRpcArgs<Fn>>,
  "p_actor" | "p_session"
>;

async function authority(context: Context, capability: PlatformCapability) {
  const session = await requirePlatformSession(context.supabase);
  const { admin } = await requirePlatformOperator(context.supabase, context.userId, capability);
  return { admin, args: { p_actor: context.userId, p_session: session.id } };
}
export async function supportRpc<Fn extends SupportRpcName>(
  context: Context,
  name: Fn,
  capability: PlatformCapability,
  args: SupportRpcArgs<Fn>,
) {
  const auth = await authority(context, capability);
  const payload = { ...args, ...auth.args } as NullableRpcArgs<PlatformRpcArgs<Fn>>;
  const result = await asUntypedRpc(auth.admin).rpc(name, payload);
  if (result.error?.code === "40001") throw new HttpError(409, "El caso cambió. Actualiza antes de guardar; tu borrador se conserva.");
  if (result.error?.code === "42501") throw new HttpError(403, "El acceso o el diagnóstico compartido cambió. Actualiza el caso.");
  if (result.error?.code === "22023") throw new HttpError(400, "Revisa el caso, el responsable y el contenido; no incluyas credenciales.");
  if (result.error) throw new HttpError(503, "Soporte no está disponible. Reintenta.");
  return result.data;
}
export async function supportScreenshot(context: Context, caseId: string) {
  const auth = await authority(context, "support.read");
  const rpc = asUntypedRpc(auth.admin);
  const args = { ...auth.args, p_case: caseId };
  const path = await rpc.rpc("platform_support_screenshot", args);
  if (path.error || typeof path.data !== "string") throw new HttpError(403, "La captura ya no está compartida.");
  if (!/^[0-9a-f-]{36}\/[0-9a-f-]{36}\/[a-zA-Z0-9_-]+\.(png|jpg|jpeg|webp)$/.test(path.data)) {
    throw new HttpError(503, "La captura no está disponible.");
  }
  const { data, error } = await auth.admin.storage.from("feedback-screenshots").createSignedUrl(path.data, 60);
  if (error || !data?.signedUrl) throw new HttpError(503, "No se pudo abrir la captura. Reintenta.");
  // Revalida después del trabajo de Storage: una retirada/revocación intermedia no entrega el enlace.
  const current = await rpc.rpc("platform_support_screenshot", args);
  if (current.error || current.data !== path.data) throw new HttpError(403, "La captura ya no está compartida.");
  return { url: data.signedUrl, expiresIn: 60 };
}
