/**
 * Operador de plataforma (tramo 9 multiempresa, server-only).
 */
import { type AuthorizedCaller, type CallerClient, HttpError } from "./httpError";
import { requireInternalOrganization } from "./organizationScope.server";
import { requireAdmin } from "./roleAuthorization.server";

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
): Promise<AuthorizedCaller & { organizationId: string }> {
  // La cuenta debe estar activa y ser administradora interna de su empresa.
  const authorized = await requireAdmin(caller, userId);
  const organizationId = await requireInternalOrganization(caller, userId);

  const { data, error } = await asUntypedRpc(caller).rpc("is_platform_operator");
  if (error) {
    console.error("[guards] is_platform_operator falló, fail-closed:", error.message);
    throw new HttpError(
      503,
      "Servicio de verificación de operador no disponible. Reintenta en unos segundos.",
    );
  }
  if (data !== true) {
    throw new HttpError(403, "Forbidden: se requiere un operador de plataforma");
  }
  return { ...authorized, organizationId };
}
