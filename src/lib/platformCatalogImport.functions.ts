import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { rpcError } from "./platformAdmin.helpers";
import {
  catalogImportInputSchema, catalogImportListInputSchema, catalogImportPageSchema,
  catalogImportPreviewInputSchema, catalogImportPreviewSchema, catalogImportResultSchema,
  type CatalogImportInput, type CatalogImportListInput, type CatalogImportPreviewInput,
} from "./platformCatalogImport.types";

export const listCatalogImportCandidatesFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((data: CatalogImportListInput) => data)
  .handler(async ({ data, context }) => {
    const g = await import("./server/adminGuards.server");
    const { admin, userId } = await g.requirePlatformOperator(context.supabase, context.userId);
    const input = catalogImportListInputSchema.safeParse(data);
    if (!input.success) throw new g.HttpError(400, "Tipo o paginación inválidos");
    const result = await g.asUntypedRpc(admin).rpc("platform_list_catalog_import_candidates", {
      p_actor: userId, p_kind: input.data.kind, p_offset: input.data.offset,
    });
    if (result.error) rpcError(g, "platform_list_catalog_import_candidates", result.error);
    const parsed = catalogImportPageSchema.safeParse(result.data);
    if (!parsed.success) throw new g.HttpError(503, "No se pudo cargar la revisión de maestros. Reintenta.");
    return parsed.data;
  });

export const getCatalogImportPreviewFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((data: CatalogImportPreviewInput) => data)
  .handler(async ({ data, context }) => {
    const g = await import("./server/adminGuards.server");
    const { admin, userId } = await g.requirePlatformOperator(context.supabase, context.userId);
    const input = catalogImportPreviewInputSchema.safeParse(data);
    if (!input.success) throw new g.HttpError(400, "Origen inválido");
    const result = await g.asUntypedRpc(admin).rpc("platform_get_catalog_import_preview", {
      p_actor: userId, p_kind: input.data.kind, p_source_id: input.data.source_id,
    });
    if (result.error) rpcError(g, "platform_get_catalog_import_preview", result.error);
    const parsed = catalogImportPreviewSchema.safeParse(result.data);
    if (!parsed.success) throw new g.HttpError(503, "No se pudo cargar la comparación. Reintenta.");
    return parsed.data;
  });

export const importCatalogCandidateFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: CatalogImportInput) => data)
  .handler(async ({ data, context }) => {
    const g = await import("./server/adminGuards.server");
    const { admin, userId } = await g.requirePlatformOperator(context.supabase, context.userId);
    const input = catalogImportInputSchema.safeParse(data);
    if (!input.success) throw new g.HttpError(400, "Revisión o motivo inválidos");
    await g.enforceRateLimit(admin, "platform-import-catalog", userId, 20, 60);
    const result = await g.asUntypedRpc(admin).rpc("platform_import_catalog_candidate", {
      p_actor: userId, p_request_id: input.data.request_id, p_kind: input.data.kind,
      p_source_id: input.data.source_id, p_fingerprint: input.data.fingerprint,
      p_resolution: input.data.resolution, p_reason: input.data.reason,
    });
    if (result.error) rpcError(g, "platform_import_catalog_candidate", result.error);
    const parsed = catalogImportResultSchema.safeParse(result.data);
    if (!parsed.success) throw new g.HttpError(503, "No se confirmó la incorporación. Reintenta la misma solicitud.");
    return parsed.data;
  });
