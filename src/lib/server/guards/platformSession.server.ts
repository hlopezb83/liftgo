import { platformSessionSchema, type PlatformSession } from "@/lib/platformOperators.types";
import { type CallerClient, HttpError } from "./httpError";
import { asUntypedRpc } from "./platformOperator.server";

/** El identificador procede de auth.jwt() en SQL, nunca de un argumento del navegador. */
export async function requirePlatformSession(caller: CallerClient): Promise<PlatformSession> {
  const result = await asUntypedRpc(caller).rpc("get_platform_session");
  if (result.error) throw new HttpError(503, "No se pudo comprobar tu sesión. Reintenta.");
  if (result.data === null) throw new HttpError(401, "Tu sesión ya no está activa. Vuelve a iniciar sesión.");
  const parsed = platformSessionSchema.safeParse(result.data);
  if (!parsed.success) throw new HttpError(503, "No se pudo comprobar tu sesión. Reintenta.");
  return parsed.data;
}
