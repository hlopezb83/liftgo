import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { rpcError } from "./platformAdmin.helpers";
import {
  platformOnboardingPageInputSchema,
  platformOnboardingPageSchema,
  platformOnboardingRequestSchema,
  type PlatformOnboardingPage,
  type PlatformOnboardingResult,
} from "./platformOnboarding.types";

export const listPendingOnboardingFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((data: { offset: number }) => data)
  .handler(async ({ data, context }): Promise<PlatformOnboardingPage> => {
    const g = await import("./server/adminGuards.server");
    const { admin, userId } = await g.requirePlatformOperator(
      context.supabase,
      context.userId,
      "organizations.create",
    );
    const input = platformOnboardingPageInputSchema.safeParse(data);
    if (!input.success) throw new g.HttpError(400, "Paginación inválida");
    const result = await g
      .asUntypedRpc(admin)
      .rpc("platform_list_pending_onboarding", {
        p_actor: userId,
        p_offset: input.data.offset,
      });
    if (result.error)
      rpcError(g, "platform_list_pending_onboarding", result.error);
    const page = platformOnboardingPageSchema.safeParse(result.data);
    if (!page.success)
      throw new g.HttpError(
        503,
        "No se pudieron verificar las altas pendientes.",
      );
    return page.data;
  });

export const resumePlatformOnboardingFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: { request_id: string }) => data)
  .handler(async ({ data, context }): Promise<PlatformOnboardingResult> => {
    const g = await import("./server/adminGuards.server");
    const { admin, userId } = await g.requirePlatformOperator(context.supabase, context.userId, "organizations.create");
    const input = platformOnboardingRequestSchema.safeParse(data);
    if (!input.success) throw new g.HttpError(400, "Solicitud inválida");
    await g.enforceRateLimit(
      admin,
      "platform-create-organization",
      userId,
      5,
      300,
    );
    const result = await g
      .asUntypedRpc(admin)
      .rpc("platform_get_onboarding", {
        p_actor: userId,
        p_request_id: input.data.request_id,
      });
    if (result.error) rpcError(g, "platform_get_onboarding", result.error);
    const onboarding = await import("./server/platformOnboarding.server");
    return onboarding.runPlatformOnboarding(
      admin,
      userId,
      onboarding.parseOnboardingJob(result.data),
    );
  });
