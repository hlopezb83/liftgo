import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supportCaseSchema, supportDetailInputSchema, supportDetailSchema, supportListInputSchema,
  supportListSchema, supportUpdateSchema, type SupportDetailInput, type SupportListInput, type SupportUpdate } from "./platformSupport.types";

export const listPlatformSupportFn = createServerFn({ method: "GET" }).middleware([requireSupabaseAuth])
  .validator((data: SupportListInput) => data).handler(async ({ data, context }) => {
    const { supportRpc } = await import("./server/platformSupport.server");
    const { HttpError } = await import("./server/adminGuards.server");
    const input = supportListInputSchema.safeParse(data);
    if (!input.success) throw new HttpError(400, "Filtros de soporte inválidos.");
    const result = await supportRpc(context, "platform_list_support", "support.read", {
      p_search: input.data.search, p_org: input.data.organizationId, p_status: input.data.status,
      p_severity: input.data.severity, p_offset: input.data.offset,
    });
    const parsed = supportListSchema.safeParse(result);
    if (!parsed.success) throw new HttpError(503, "No se pudieron cargar los casos. Reintenta.");
    return parsed.data;
  });

export const getPlatformSupportFn = createServerFn({ method: "GET" }).middleware([requireSupabaseAuth])
  .validator((data: SupportDetailInput) => data).handler(async ({ data, context }) => {
    const { supportRpc } = await import("./server/platformSupport.server");
    const { HttpError } = await import("./server/adminGuards.server");
    const input = supportDetailInputSchema.safeParse(data);
    if (!input.success) throw new HttpError(400, "Caso o cursor inválido.");
    const result = await supportRpc(context, "platform_get_support", "support.read", { p_case: input.data.caseId, p_before: input.data.before });
    const parsed = supportDetailSchema.safeParse(result);
    if (!parsed.success) throw new HttpError(503, "No se pudo cargar el caso. Reintenta.");
    return parsed.data;
  });

export const updatePlatformSupportFn = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .validator((data: SupportUpdate) => data).handler(async ({ data, context }) => {
    const { supportRpc } = await import("./server/platformSupport.server");
    const { HttpError } = await import("./server/adminGuards.server");
    const input = supportUpdateSchema.safeParse(data);
    if (!input.success) throw new HttpError(400, "Seguimiento inválido.");
    const result = await supportRpc(context, "platform_update_support", "support.manage", {
      p_case: input.data.caseId, p_revision: input.data.revision, p_status: input.data.status,
      p_severity: input.data.severity, p_assignee: input.data.assigneeId, p_comment: input.data.comment,
    });
    const parsed = supportCaseSchema.safeParse(result);
    if (!parsed.success) throw new HttpError(503, "No se pudo confirmar el cambio. Actualiza el caso.");
    return parsed.data;
  });

export const getPlatformSupportScreenshotFn = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .validator((data: { caseId: string }) => data).handler(async ({ data, context }) => {
    const { supportScreenshot } = await import("./server/platformSupport.server");
    const { HttpError } = await import("./server/adminGuards.server");
    const input = supportDetailInputSchema.safeParse(data);
    if (!input.success) throw new HttpError(400, "Caso inválido.");
    return supportScreenshot(context, input.data.caseId);
  });
