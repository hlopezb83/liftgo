import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { rpcError } from "./platformAdmin.helpers";
import {
  platformOrganizationDetailInputSchema,
  platformOrganizationDetailSchema,
  type PlatformOrganizationDetailInput,
} from "./platformOrganizationDetail.types";

export const getPlatformOrganizationDetailFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((data: PlatformOrganizationDetailInput) => data)
  .handler(async ({ data, context }) => {
    const g = await import("./server/adminGuards.server");
    const { admin, userId } = await g.requirePlatformOperator(context.supabase, context.userId, "organizations.details");
    const input = platformOrganizationDetailInputSchema.safeParse(data);
    if (!input.success)
      throw new g.HttpError(400, "Identificador de empresa inválido");
    const result = await g
      .asUntypedRpc(admin)
      .rpc("platform_get_organization_detail", {
        p_actor: userId,
        p_organization_id: input.data.organization_id,
      });
    if (result.error)
      rpcError(g, "platform_get_organization_detail", result.error);
    const parsed = platformOrganizationDetailSchema.safeParse(result.data);
    if (!parsed.success)
      throw new g.HttpError(
        503,
        "No se pudo cargar la ficha de empresa. Reintenta.",
      );
    // La proyección SQL y el contrato de respuesta excluyen campos no autorizados.
    return parsed.data;
  });
