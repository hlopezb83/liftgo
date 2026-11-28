/**
 * Operador de plataforma (tramo 9 multiempresa, server-only).
 */
import type { Database } from "@/integrations/supabase/types";
import type { PlatformCapability } from "@/lib/auth/platformAccess.types";
import { setVerifiedServerIdentity } from "@/lib/observability/serverSentry.server";
import { type AdminClient, type CallerClient, HttpError } from "./httpError";

type PublicFunctions = Database["public"]["Functions"];

export type NullableRpcArgs<T> = { [K in keyof T]: T[K] | null | undefined };

/** PostgREST acepta cursores bigint como string decimal para preservar precisión > 2^53-1. */
type PlatformBigintCursorOverrides = {
  platform_get_support: { p_before?: number | string };
  platform_list_audit_events: { p_before_id?: number | string };
};

type ZeroArgRpcName = {
  [Fn in keyof PublicFunctions]: [PublicFunctions[Fn]["Args"]] extends [never] ? Fn : never;
}[keyof PublicFunctions];

export type PlatformRpcArgs<Fn extends keyof PublicFunctions> = Fn extends keyof PlatformBigintCursorOverrides
  ? Omit<PublicFunctions[Fn]["Args"], keyof PlatformBigintCursorOverrides[Fn]> & PlatformBigintCursorOverrides[Fn]
  : PublicFunctions[Fn]["Args"];

/**
 * Fachada tipada sobre `Database["public"]["Functions"]` que conserva el nombre
 * `asUntypedRpc` por compatibilidad con tests y guards existentes.
 */
export interface UntypedRpcClient {
  rpc<Fn extends ZeroArgRpcName>(
    fn: Fn,
  ): PromiseLike<{ data: unknown; error: { message: string; code?: string } | null }>;
  rpc<Fn extends keyof PublicFunctions>(
    fn: Fn,
    args: NullableRpcArgs<PlatformRpcArgs<Fn>>,
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
