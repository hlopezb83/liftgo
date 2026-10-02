import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  integrationCheckInputSchema, integrationListInputSchema, integrationListSchema, integrationStatusSchema, monitoringSchema,
  type IntegrationCheckInput, type IntegrationListInput,
} from "./platformHealth.types";

export const listPlatformIntegrationsFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth]).validator((data: IntegrationListInput) => data)
  .handler(async ({ data, context }) => {
    const g = await import("./server/adminGuards.server");
    const { requirePlatformSession } = await import("./server/guards/platformSession.server");
    const input = integrationListInputSchema.safeParse(data);
    if (!input.success) throw new g.HttpError(400, "Filtros de integraciones inválidos.");
    const session = await requirePlatformSession(context.supabase);
    const { admin } = await g.requirePlatformOperator(context.supabase, context.userId, "integrations.read");
    const result = await g.asUntypedRpc(admin).rpc("platform_get_integrations", {
      p_actor: context.userId, p_session: session.id, p_search: input.data.search, p_offset: input.data.offset,
    });
    const parsed = integrationListSchema.safeParse(result.data);
    if (result.error || !parsed.success) throw new g.HttpError(503, "No se pudieron cargar las integraciones. Reintenta.");
    return parsed.data;
  });

export const getPlatformMonitoringFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth]).handler(async ({ context }) => {
    const g = await import("./server/adminGuards.server");
    const { requirePlatformSession } = await import("./server/guards/platformSession.server");
    const session = await requirePlatformSession(context.supabase);
    const { admin } = await g.requirePlatformOperator(context.supabase, context.userId, "monitoring.read");
    const result = await g.asUntypedRpc(admin).rpc("platform_get_monitoring", { p_actor: context.userId, p_session: session.id });
    const parsed = monitoringSchema.safeParse(result.data);
    if (result.error || !parsed.success) throw new g.HttpError(503, "No se pudo cargar el monitoreo. Reintenta.");
    return parsed.data;
  });

const reservationSchema = z.discriminatedUnion("started", [
  z.object({ started: z.literal(false), status: integrationStatusSchema }),
  z.object({ started: z.literal(true), mode: z.string().nullable(), apiKey: z.string().nullable(),
    preflight: z.enum(["ready", "unconfigured", "duplicate_key", "invalid_key_mode"]) }),
]);
export const checkPlatformIntegrationFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth]).validator((data: IntegrationCheckInput) => data)
  .handler(async ({ data, context }) => {
    const g = await import("./server/adminGuards.server");
    const { requirePlatformSession } = await import("./server/guards/platformSession.server");
    const input = integrationCheckInputSchema.safeParse(data);
    if (!input.success) throw new g.HttpError(400, "Empresa o solicitud inválida.");
    const session = await requirePlatformSession(context.supabase);
    const { admin } = await g.requirePlatformOperator(context.supabase, context.userId, "integrations.check");
    await g.enforceRateLimit(admin, "platform-integration-check", context.userId, 5, 60);
    const rpc = g.asUntypedRpc(admin);
    const claim = await rpc.rpc("platform_begin_integration_check", {
      p_actor: context.userId, p_session: session.id, p_org: input.data.organizationId, p_request: input.data.requestId,
    });
    if (claim.error?.code === "P0001") throw new g.HttpError(429, "Espera un minuto antes de comprobar esta empresa de nuevo.");
    if (claim.error?.code === "42501") throw new g.HttpError(403, "Tu acceso cambió. Actualiza la sesión.");
    if (claim.error?.code === "22023") throw new g.HttpError(400, "La empresa debe estar activa.");
    const reservation = reservationSchema.safeParse(claim.data);
    if (claim.error) throw new g.HttpError(503, "No se pudo iniciar la comprobación. Reintenta.");
    if (!reservation.success) throw new g.HttpError(503, "No se pudo iniciar la comprobación. Reintenta.");
    if (!reservation.data.started) return { status: reservation.data.status };
    const { checkReservedFacturapiConnection } = await import("./server/platformFacturapiHealth.server");
    const result = await checkReservedFacturapiConnection(reservation.data);
    const { version } = await import("../../public/version.json");
    const complete = await rpc.rpc("platform_complete_integration_check", {
      p_actor: context.userId, p_session: session.id, p_request: input.data.requestId,
      p_status: result.status, p_latency: result.latencyMs, p_http_status: result.httpStatus, p_version: version,
    });
    const status = integrationStatusSchema.safeParse(complete.data);
    if (complete.error || !status.success) throw new g.HttpError(503, "La comprobación terminó pero no se pudo guardar. Actualiza antes de repetir.");
    return { status: status.data };
  });
