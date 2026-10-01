import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { rpcError } from "./platformAdmin.helpers";
import {
  platformAuditInputSchema,
  platformAuditPageSchema,
  type PlatformAuditInput,
} from "./platformAudit.types";

export const listPlatformAuditEventsFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((data: PlatformAuditInput) => data)
  .handler(async ({ data, context }) => {
    const g = await import("./server/adminGuards.server");
    const { admin, userId } = await g.requirePlatformOperator(
      context.supabase,
      context.userId,
    );
    const input = platformAuditInputSchema.safeParse(data);
    if (!input.success)
      throw new g.HttpError(400, "Filtros o paginación inválidos");
    const result = await g
      .asUntypedRpc(admin)
      .rpc("platform_list_audit_events", {
        p_actor: userId,
        p_organization_id: input.data.organization_id ?? null,
        p_target_type: input.data.target_type ?? null,
        p_before_id: input.data.before_id ?? null,
        p_limit: input.data.limit,
      });
    if (result.error) rpcError(g, "platform_list_audit_events", result.error);
    const parsed = platformAuditPageSchema.safeParse(result.data);
    if (!parsed.success)
      throw new g.HttpError(503, "No se pudo cargar la bitácora. Reintenta.");
    return parsed.data;
  });
