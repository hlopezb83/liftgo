import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { rpcError } from "./platformAdmin.helpers";
import type {
  AssignLegalTemplateVersionInput,
  LegalTemplateContent,
  PlatformLegalTemplateAssignment,
  PlatformLegalTemplateRow,
  PlatformLegalTemplateVersion,
  PublishLegalTemplateVersionInput,
  PublishLegalTemplateVersionResult,
} from "./platformLegalTemplates.types";

export type {
  AssignLegalTemplateVersionInput,
  LegalTemplateContent,
  PlatformLegalTemplateAssignment,
  PlatformLegalTemplateRow,
  PlatformLegalTemplateVersion,
  PublishLegalTemplateVersionInput,
  PublishLegalTemplateVersionResult,
};

const EMPTY_CONTENT: LegalTemplateContent = {
  intro_text: null,
  declarations_landlord: [],
  declarations_tenant: [],
  clauses: [],
  checklist_sections: [],
  pagare_text: null,
};

function asContent(value: unknown): LegalTemplateContent {
  if (!value || typeof value !== "object" || Array.isArray(value)) return EMPTY_CONTENT;
  const row = value as Partial<LegalTemplateContent>;
  return {
    body_text: typeof row.body_text === "string" ? row.body_text : null,
    intro_text: typeof row.intro_text === "string" ? row.intro_text : null,
    declarations_landlord: Array.isArray(row.declarations_landlord)
      ? row.declarations_landlord.map(String)
      : [],
    declarations_tenant: Array.isArray(row.declarations_tenant)
      ? row.declarations_tenant.map(String)
      : [],
    clauses: Array.isArray(row.clauses) ? row.clauses : [],
    checklist_sections: Array.isArray(row.checklist_sections)
      ? row.checklist_sections
      : [],
    pagare_text: typeof row.pagare_text === "string" ? row.pagare_text : null,
  };
}

function validatePublish(
  g: typeof import("./server/adminGuards.server"),
  data: PublishLegalTemplateVersionInput,
) {
  if (!g.isUUID(data.definition_id)) throw new g.HttpError(400, "Plantilla inválida");
  const summary = data.change_summary?.trim();
  if (!summary || summary.length > 500) {
    throw new g.HttpError(400, "El resumen del cambio debe tener entre 1 y 500 caracteres");
  }
  if (!data.content || typeof data.content !== "object" || Array.isArray(data.content)) {
    throw new g.HttpError(400, "El contenido de la plantilla es inválido");
  }
}

export const listPlatformLegalTemplatesFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<PlatformLegalTemplateRow[]> => {
    const g = await import("./server/adminGuards.server");
    const { admin, userId } = await g.requirePlatformOperator(context.supabase, context.userId);
    const { data, error } = await g.asUntypedRpc(admin).rpc(
      "platform_list_legal_templates",
      { p_actor: userId },
    );
    if (error) rpcError(g, "platform_list_legal_templates", error);
    return ((data ?? []) as Record<string, unknown>[]).map((row) => ({
      id: String(row["id"]),
      template_key: String(row["template_key"] ?? ""),
      document_type: String(row["document_type"] ?? ""),
      name: String(row["name"] ?? ""),
      description: row["description"] == null ? null : String(row["description"]),
      is_active: row["is_active"] === true,
      current_version_id: row["current_version_id"] == null ? null : String(row["current_version_id"]),
      current_version: row["current_version"] == null ? null : Number(row["current_version"]),
      checksum_sha256: row["checksum_sha256"] == null ? null : String(row["checksum_sha256"]),
      content: asContent(row["content"]),
      change_summary: row["change_summary"] == null ? null : String(row["change_summary"]),
      version_count: Number(row["version_count"] ?? 0),
      assignment_count: Number(row["assignment_count"] ?? 0),
      active_organization_count: Number(row["active_organization_count"] ?? 0),
      updated_at: String(row["updated_at"] ?? ""),
    }));
  });

export const listPlatformLegalTemplateVersionsFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((data: { definition_id: string }) => data)
  .handler(async ({ data, context }): Promise<PlatformLegalTemplateVersion[]> => {
    const g = await import("./server/adminGuards.server");
    if (!g.isUUID(data.definition_id)) throw new g.HttpError(400, "Plantilla inválida");
    const { admin, userId } = await g.requirePlatformOperator(context.supabase, context.userId);
    const result = await g.asUntypedRpc(admin).rpc("platform_list_legal_template_versions", {
      p_actor: userId,
      p_definition_id: data.definition_id,
    });
    if (result.error) rpcError(g, "platform_list_legal_template_versions", result.error);
    return ((result.data ?? []) as Record<string, unknown>[]).map((row) => ({
      id: String(row["id"]),
      definition_id: String(row["definition_id"]),
      version: Number(row["version"]),
      checksum_sha256: String(row["checksum_sha256"]),
      content: asContent(row["content"]),
      change_summary: row["change_summary"] == null ? null : String(row["change_summary"]),
      created_by: row["created_by"] == null ? null : String(row["created_by"]),
      created_at: String(row["created_at"] ?? ""),
    }));
  });

export const listPlatformLegalTemplateAssignmentsFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((data: { definition_id: string }) => data)
  .handler(async ({ data, context }): Promise<PlatformLegalTemplateAssignment[]> => {
    const g = await import("./server/adminGuards.server");
    if (!g.isUUID(data.definition_id)) throw new g.HttpError(400, "Plantilla inválida");
    const { admin, userId } = await g.requirePlatformOperator(context.supabase, context.userId);
    const result = await g.asUntypedRpc(admin).rpc("platform_list_legal_template_assignments", {
      p_actor: userId,
      p_definition_id: data.definition_id,
    });
    if (result.error) rpcError(g, "platform_list_legal_template_assignments", result.error);
    return ((result.data ?? []) as Record<string, unknown>[]).map((row) => ({
      organization_id: String(row["organization_id"]),
      organization_name: String(row["organization_name"] ?? ""),
      organization_slug: String(row["organization_slug"] ?? ""),
      organization_is_active: row["organization_is_active"] === true,
      version_id: row["version_id"] == null ? null : String(row["version_id"]),
      version: row["version"] == null ? null : Number(row["version"]),
      checksum_sha256: row["checksum_sha256"] == null ? null : String(row["checksum_sha256"]),
      local_overrides: (row["local_overrides"] ?? {}) as PlatformLegalTemplateAssignment["local_overrides"],
      assignment_is_active: row["assignment_is_active"] === true,
      updated_at: row["updated_at"] == null ? null : String(row["updated_at"]),
    }));
  });

export const publishPlatformLegalTemplateVersionFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: PublishLegalTemplateVersionInput) => data)
  .handler(async ({ data, context }): Promise<PublishLegalTemplateVersionResult> => {
    const g = await import("./server/adminGuards.server");
    validatePublish(g, data);
    const { admin, userId } = await g.requirePlatformOperator(context.supabase, context.userId);
    await g.enforceRateLimit(admin, "platform-publish-legal-template", userId, 10, 300);
    const result = await g.asUntypedRpc(admin).rpc("platform_publish_legal_template_version", {
      p_actor: userId,
      p_definition_id: data.definition_id,
      p_content: data.content,
      p_change_summary: data.change_summary.trim(),
      p_assign_all_active: data.assign_all_active === true,
    });
    if (result.error) rpcError(g, "platform_publish_legal_template_version", result.error);
    const row = (result.data as Record<string, unknown>[] | null)?.[0];
    if (!row) throw new g.HttpError(500, "No se pudo confirmar la nueva versión");
    return {
      version_id: String(row["version_id"]),
      version: Number(row["version"]),
      checksum_sha256: String(row["checksum_sha256"]),
    };
  });

export const assignPlatformLegalTemplateVersionFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: AssignLegalTemplateVersionInput) => data)
  .handler(async ({ data, context }): Promise<{ success: true }> => {
    const g = await import("./server/adminGuards.server");
    if (![data.organization_id, data.definition_id, data.version_id].every(g.isUUID)) {
      throw new g.HttpError(400, "Asignación legal inválida");
    }
    const { admin, userId } = await g.requirePlatformOperator(context.supabase, context.userId);
    await g.enforceRateLimit(admin, "platform-assign-legal-template", userId, 30, 60);
    const { error } = await g.asUntypedRpc(admin).rpc("platform_assign_legal_template_version", {
      p_actor: userId,
      p_organization_id: data.organization_id,
      p_definition_id: data.definition_id,
      p_version_id: data.version_id,
    });
    if (error) rpcError(g, "platform_assign_legal_template_version", error);
    return { success: true };
  });
