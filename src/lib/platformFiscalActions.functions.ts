import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { redactDiagnosticText } from "@/lib/ui/errorReportJson";
import { fiscalActionInputSchema, fiscalActionsSchema, type FiscalActionInput } from "./platformFiscalActions.types";

export const performPlatformFiscalActionFn = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .validator((data: FiscalActionInput) => data).handler(async ({ data, context }) => {
    const { HttpError } = await import("./server/adminGuards.server");
    const input = fiscalActionInputSchema.safeParse(data);
    if (!input.success) throw new HttpError(400, "Revisa el trabajo y escribe un motivo de 10 a 300 caracteres.");
    const { performPlatformFiscalAction } = await import("./server/platformFiscalActions.server");
    return performPlatformFiscalAction(context, { ...input.data, reason: redactDiagnosticText(input.data.reason) });
  });
export const listPlatformFiscalActionsFn = createServerFn({ method: "GET" }).middleware([requireSupabaseAuth])
  .validator((data: { jobId: string }) => data).handler(async ({ data, context }) => {
    const { HttpError } = await import("./server/adminGuards.server");
    const input = z.object({ jobId: z.uuid() }).safeParse(data);
    if (!input.success) throw new HttpError(400, "Trabajo inválido.");
    const { fiscalJobsRpc } = await import("./server/platformFiscalJobs.server");
    const result = await fiscalJobsRpc(context, "platform_list_fiscal_actions", { p_job: input.data.jobId });
    const parsed = fiscalActionsSchema.safeParse(result);
    if (!parsed.success) throw new HttpError(503, "No se pudo cargar el historial de consultas fiscales.");
    return parsed.data;
  });
