/**
 * Operación de plataforma (tramo 9 multiempresa): alta y suspensión de
 * empresas y alta de su primer administrador.
 *
 * Reglas:
 *  · Sólo un operador de plataforma activo (`platform_operators`) puede
 *    invocar estas funciones. El guard se evalúa con el cliente del usuario y
 *    la base vuelve a verificarlo en cada RPC (`assert_platform_operator`).
 *  · Las RPC `platform_*` sólo son ejecutables por `service_role`; el
 *    navegador nunca las llama directamente ni envía `organization_id`
 *    como verdad: aquí sólo identifica QUÉ empresa operar, y la base decide.
 *  · El alta guarda una solicitud durable antes de crear Auth. Un reintento
 *    retoma la identidad reservada sin compensaciones destructivas.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { rpcError } from "./platformAdmin.helpers";
import {
  platformOnboardingInputSchema,
  type PlatformOnboardingResult,
} from "./platformOnboarding.types";
import { platformOrganizationStatusInputSchema } from "./platformOrganizationStatus.types";
import type {
  CreateOrganizationInput,
  CreateOrganizationResult,
  PlatformOperatorStatus,
  PlatformOrganizationRow,
  SetOrganizationActiveInput,
} from "./platformAdmin.types";

export type {
  CreateOrganizationInput,
  CreateOrganizationResult,
  PlatformOperatorStatus,
  PlatformOrganizationRow,
  SetOrganizationActiveInput,
};

/** ¿El usuario autenticado es operador de plataforma? (para mostrar la sección). */
export const getPlatformOperatorStatusFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<PlatformOperatorStatus> => {
    const g = await import("./server/adminGuards.server");
    const { data, error } = await g
      .asUntypedRpc(context.supabase)
      .rpc("is_platform_operator");
    if (error) {
      throw new g.HttpError(
        503,
        "No se pudo verificar el acceso a la plataforma. Reintenta.",
      );
    }
    return { isOperator: data === true };
  });

export const listOrganizationsFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<PlatformOrganizationRow[]> => {
    const g = await import("./server/adminGuards.server");
    const { admin, userId } = await g.requirePlatformOperator(context.supabase, context.userId, "organizations.read");

    const { data, error } = await g
      .asUntypedRpc(admin)
      .rpc("platform_list_organizations", {
        p_actor: userId,
      });
    if (error) rpcError(g, "platform_list_organizations", error);

    const rows = (data ?? []) as Record<string, unknown>[];
    const ids = rows.map((row) => String(row["id"]));
    const razonByOrg = new Map<string, string>();
    if (ids.length > 0) {
      const settings = await (
        admin as unknown as {
          from: (t: string) => {
            select: (c: string) => {
              in: (k: string, v: string[]) => Promise<{ data: unknown }>;
            };
          };
        }
      )
        .from("company_settings")
        .select("organization_id, razon_social")
        .in("organization_id", ids);
      for (const s of (settings.data ?? []) as Record<string, unknown>[]) {
        const razon =
          typeof s["razon_social"] === "string" ? s["razon_social"].trim() : "";
        if (razon) razonByOrg.set(String(s["organization_id"]), razon);
      }
    }

    return rows.map((row) => ({
      id: String(row["id"]),
      name: String(row["name"] ?? ""),
      slug: String(row["slug"] ?? ""),
      is_active: row["is_active"] === true,
      created_at: String(row["created_at"] ?? ""),
      internal_members: Number(row["internal_members"] ?? 0),
      portal_accounts: Number(row["portal_accounts"] ?? 0),
      customers: Number(row["customers"] ?? 0),
      razon_social: razonByOrg.get(String(row["id"])) ?? null,
    }));
  });

export const createOrganizationFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: CreateOrganizationInput) => data)
  .handler(async ({ data, context }): Promise<PlatformOnboardingResult> => {
    const g = await import("./server/adminGuards.server");
    const { admin, userId } = await g.requirePlatformOperator(context.supabase, context.userId, "organizations.create");
    const input = platformOnboardingInputSchema.safeParse(data);
    if (!input.success)
      throw new g.HttpError(400, "Datos de incorporación inválidos");
    await g.enforceRateLimit(
      admin,
      "platform-create-organization",
      userId,
      5,
      300,
    );
    const result = await g
      .asUntypedRpc(admin)
      .rpc("platform_begin_onboarding", {
        p_actor: userId,
        p_request_id: input.data.request_id,
        p_name: input.data.name,
        p_slug: input.data.slug,
        p_admin_email: input.data.admin_email,
        p_admin_full_name: input.data.admin_full_name,
      });
    if (result.error) rpcError(g, "platform_begin_onboarding", result.error);
    const onboarding = await import("./server/platformOnboarding.server");
    return onboarding.runPlatformOnboarding(
      admin,
      userId,
      onboarding.parseOnboardingJob(result.data),
    );
  });

export const setOrganizationActiveFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: SetOrganizationActiveInput) => data)
  .handler(async ({ data, context }): Promise<{ success: true }> => {
    const g = await import("./server/adminGuards.server");
    const { admin, userId: actorId } = await g.requirePlatformOperator(context.supabase, context.userId, data?.active === true ? "organizations.resume" : "organizations.suspend");
    await g.enforceRateLimit(
      admin,
      "platform-set-organization-active",
      actorId,
      10,
      60,
    );

    const parsed = platformOrganizationStatusInputSchema.safeParse(data);
    if (!parsed.success)
      throw new g.HttpError(
        400,
        "Indica una empresa válida, su estado y un motivo operativo de 5 a 500 caracteres, sin llaves ni tokens",
      );
    // La RPC conserva la protección de suspensión de la propia empresa,
    // consultando la membresía del actor sin exigir una empresa activa aquí.

    const { error } = await g
      .asUntypedRpc(admin)
      .rpc("platform_set_organization_active_with_reason", {
        p_actor: actorId,
        p_organization_id: parsed.data.organization_id,
        p_active: parsed.data.active,
        p_reason: parsed.data.reason,
      });
    if (error) rpcError(g, "platform_set_organization_active", error);
    return { success: true };
  });
