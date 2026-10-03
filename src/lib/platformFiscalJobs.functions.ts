import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { fiscalJobDetailInputSchema, fiscalJobDetailSchema, fiscalJobsInputSchema, fiscalJobsSchema,
  type FiscalJobDetailInput, type FiscalJobsInput } from "./platformFiscalJobs.types";

export const listPlatformFiscalJobsFn = createServerFn({ method: "GET" }).middleware([requireSupabaseAuth])
  .validator((data: FiscalJobsInput) => data).handler(async ({ data, context }) => {
    const { HttpError } = await import("./server/adminGuards.server");
    const input = fiscalJobsInputSchema.safeParse(data);
    if (!input.success) throw new HttpError(400, "Filtros fiscales inválidos.");
    const { fiscalJobsRpc } = await import("./server/platformFiscalJobs.server");
    const result = await fiscalJobsRpc(context, "platform_list_fiscal_jobs", { p_search: input.data.search,
      p_org: input.data.organizationId, p_status: input.data.status, p_operation: input.data.operation, p_offset: input.data.offset });
    const parsed = fiscalJobsSchema.safeParse(result);
    if (!parsed.success) throw new HttpError(503, "No se pudieron cargar los trabajos fiscales. Reintenta.");
    return parsed.data;
  });
export const getPlatformFiscalJobFn = createServerFn({ method: "GET" }).middleware([requireSupabaseAuth])
  .validator((data: FiscalJobDetailInput) => data).handler(async ({ data, context }) => {
    const { HttpError } = await import("./server/adminGuards.server");
    const input = fiscalJobDetailInputSchema.safeParse(data);
    if (!input.success) throw new HttpError(400, "Trabajo o cursor inválido.");
    const { fiscalJobsRpc } = await import("./server/platformFiscalJobs.server");
    const result = await fiscalJobsRpc(context, "platform_get_fiscal_job", { p_job: input.data.jobId, p_before: input.data.before });
    const parsed = fiscalJobDetailSchema.safeParse(result);
    if (!parsed.success) throw new HttpError(503, "No se pudo cargar el historial fiscal. Reintenta.");
    return parsed.data;
  });
