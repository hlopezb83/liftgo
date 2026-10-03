import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  organizationGovernanceInputSchema, organizationGovernanceResultSchema, organizationGovernanceSchema,
  organizationGovernanceSummarySchema, organizationGovernanceTargetSchema, type OrganizationGovernanceInput,
} from "./platformOrganizationGovernance.types";

export const listPlatformOrganizationGovernanceFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { organizationGovernanceRpc } = await import("./server/platformOrganizationGovernance.server");
    const { HttpError } = await import("./server/adminGuards.server");
    const data = await organizationGovernanceRpc(context, "platform_list_organization_governance", "organizations.read");
    const parsed = z.array(organizationGovernanceSummarySchema).safeParse(data);
    if (!parsed.success) throw new HttpError(503, "No se pudo cargar la clasificación de las empresas. Reintenta.");
    return parsed.data;
  });

export const getPlatformOrganizationGovernanceFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((data: { organizationId: string }) => data)
  .handler(async ({ data, context }) => {
    const { HttpError } = await import("./server/adminGuards.server");
    const input = organizationGovernanceTargetSchema.safeParse(data);
    if (!input.success) throw new HttpError(400, "Identificador de empresa inválido");
    const { organizationGovernanceRpc } = await import("./server/platformOrganizationGovernance.server");
    const result = await organizationGovernanceRpc(context, "platform_get_organization_governance", "organizations.details",
      { p_organization_id: input.data.organizationId });
    const parsed = organizationGovernanceSchema.safeParse(result);
    if (!parsed.success) throw new HttpError(503, "No se pudo cargar el contacto de la empresa. Reintenta.");
    return parsed.data;
  });

export const setPlatformOrganizationGovernanceFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: OrganizationGovernanceInput) => data)
  .handler(async ({ data, context }) => {
    const { HttpError } = await import("./server/adminGuards.server");
    const input = organizationGovernanceInputSchema.safeParse(data);
    if (!input.success) throw new HttpError(400, "Revisa la clasificación, el contacto y el motivo.");
    const { organizationGovernanceRpc } = await import("./server/platformOrganizationGovernance.server");
    const v = input.data;
    const result = await organizationGovernanceRpc(context, "platform_set_organization_governance", "organizations.configure", {
      p_organization_id: v.organizationId, p_revision: v.revision, p_classification: v.classification,
      p_city: v.city, p_territory: v.territory, p_contact_name: v.contactName, p_contact_email: v.contactEmail,
      p_contact_phone: v.contactPhone, p_reason: v.reason,
    });
    const parsed = organizationGovernanceResultSchema.safeParse(result);
    if (!parsed.success) throw new HttpError(503, "No se pudo confirmar el guardado. Revisa la ficha antes de reintentar.");
    return parsed.data;
  });
