import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  platformOperatorChangeSchema, platformOperatorsInputSchema, platformOperatorsResultSchema,
  type PlatformOperatorChange, type PlatformOperatorsInput,
} from "./platformOperators.types";

export const getPlatformSessionFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { requirePlatformSession } = await import("./server/guards/platformSession.server");
    const { id: _id, ...session } = await requirePlatformSession(context.supabase);
    return session;
  });

export const listPlatformOperatorsFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((data: PlatformOperatorsInput) => data)
  .handler(async ({ data, context }) => {
    const g = await import("./server/adminGuards.server");
    const { requirePlatformSession } = await import("./server/guards/platformSession.server");
    const input = platformOperatorsInputSchema.safeParse(data);
    if (!input.success) throw new g.HttpError(400, "Filtros de operadores inválidos.");
    const session = await requirePlatformSession(context.supabase);
    const { admin } = await g.requirePlatformOperator(context.supabase, context.userId, "operators.read");
    const result = await g.asUntypedRpc(admin).rpc("platform_list_operator_accounts", {
      p_actor: context.userId, p_session: session.id,
      p_search: input.data.search, p_scope: input.data.scope, p_offset: input.data.offset,
    });
    const parsed = platformOperatorsResultSchema.safeParse(result.data);
    if (result.error || !parsed.success) throw new g.HttpError(503, "No se pudieron cargar los operadores. Reintenta.");
    return parsed.data;
  });

export const setPlatformOperatorProfileFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: PlatformOperatorChange) => data)
  .handler(async ({ data, context }) => {
    const g = await import("./server/adminGuards.server");
    const input = platformOperatorChangeSchema.safeParse(data);
    if (!input.success) throw new g.HttpError(400, "Revisa el perfil, el motivo y tu contraseña.");
    const { requirePlatformPassword } = await import("./server/guards/platformPassword.server");
    const { admin, sessionId } = await requirePlatformPassword(context.supabase, context.userId, input.data.password);
    const result = await g.asUntypedRpc(admin).rpc("platform_set_operator_profile", {
      p_actor: context.userId, p_session: sessionId, p_user_id: input.data.userId,
      p_profile: input.data.profile, p_expected_revision: input.data.expectedRevision, p_reason: input.data.reason,
    });
    if (result.error) {
      if (result.error.code === "40001") throw new g.HttpError(409, "El acceso cambió. Actualiza el listado y revisa el perfil antes de reintentar.");
      if (result.error.code === "42501") throw new g.HttpError(403, "No se permite este cambio. Verifica tus permisos y conserva un operador raíz activo.");
      if (result.error.code === "22023") throw new g.HttpError(400, "La cuenta debe estar activa y verificada. Revisa el perfil y el motivo.");
      throw new g.HttpError(503, "No se pudo actualizar el acceso. Reintenta.");
    }
    return { changed: result.data === true };
  });
