/**
 * Operador de plataforma (tramo 9 multiempresa, server-only).
 */
import { setVerifiedServerIdentity } from "@/lib/observability/serverSentry.server";
import type { PlatformCapability } from "@/lib/platformAccess.types";
import { type AdminClient, type CallerClient, HttpError } from "./httpError";

/**
 * RPC sin tipado generado: los objetos de la migración 0030
 * (`platform_operators`, `is_platform_operator`, `platform_*`) todavía no
 * están en `src/integrations/supabase/types.ts` (se regenera al aplicar la
 * migración). El contrato se fija aquí, no en el navegador.
 */
export interface UntypedRpcClient {
  rpc(
    fn: string,
    args?: Record<string, unknown>,
  ): PromiseLike<{ data: unknown; error: { message: string; code?: string } | null }>;
}

export const asUntypedRpc = (client: unknown): UntypedRpcClient =>
  client as UntypedRpcClient;

/**
 * Exige que el caller sea un operador de plataforma activo.
 *
 * Se decide con el cliente del propio usuario (`is_platform_operator`,
 * SECURITY DEFINER, sólo lee su propia fila) y sólo después se carga el
 * cliente privilegiado. Las funciones `platform_*` vuelven a verificar al
 * actor en la base (`assert_platform_operator`): la UI nunca es la única
 * barrera. Fail-closed ante cualquier error de lectura.
 */
export async function requirePlatformOperator(
  caller: CallerClient,
  userId: string,
  capability?: PlatformCapability,
): Promise<{ userId: string; admin: AdminClient }> {
  // El RPC verifica asignación explícita y perfil activo. La autoridad global
  // no depende del rol, la membresía ni el estado de una empresa.
  const rpc = asUntypedRpc(caller);
  const { data, error } = capability
    ? await rpc.rpc("has_platform_capability", { p_capability: capability })
    : await rpc.rpc("is_platform_operator");
  if (error) {
    console.error("[guards] verificación de plataforma falló, fail-closed:", error.message);
    throw new HttpError(
      503,
      "Servicio de verificación de operador no disponible. Reintenta en unos segundos.",
    );
  }
  if (data !== true) {
    throw new HttpError(403, capability
      ? `Forbidden: se requiere el permiso de plataforma ${capability}`
      : "Forbidden: se requiere un operador de plataforma");
  }
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  setVerifiedServerIdentity({ userId, workspace: "platform" });
  return { userId, admin: supabaseAdmin as AdminClient };
}
