import { useQuery } from "@tanstack/react-query";
import { useOrganizationContext } from "@/contexts/OrganizationContext";
import {
  ContractTemplateUnavailableError,
  resolveSingleDefaultTemplate,
} from "@/features/contracts/lib/contractTemplateResolution";
import type { ContractClause, ChecklistSection } from "@/features/contracts/lib/contractTypes";
import { supabase } from "@/integrations/supabase/client";
import type { Tables, TablesUpdate } from "@/integrations/supabase/types";
import { parseJsonbArray } from "@/lib/domain/lineItems";
import { useEntityMutation } from "@/lib/hooks/useEntityMutation";
import { assertRowsAffected } from "@/lib/supabase/assertRowsAffected";
import { contractTemplateKeys } from "../lib/queryKeys";

// Re-export para compatibilidad con consumidores existentes. La fuente de
// verdad de estos tipos vive en `@/features/contracts/lib/contractTypes`.
export type { ContractClause, ChecklistSection };


export interface ContractTemplate {
  id: string;
  name: string;
  body_text: string;
  is_default: boolean;
  intro_text: string | null;
  declarations_landlord: string[];
  declarations_tenant: string[];
  clauses: ContractClause[];
  checklist_sections: ChecklistSection[];
  pagare_text: string | null;
  updated_at: string | null;
}

// v7.216.0 (C6): columnas explícitas.
const CONTRACT_TEMPLATE_COLUMNS =
  "id, name, body_text, is_default, intro_text, declarations_landlord, declarations_tenant, " +
  "clauses, checklist_sections, pagare_text, updated_at, created_at";

/**
 * Subtramo 6.1: la plantilla se lee dentro de la organización verificada en
 * servidor (nunca un `organization_id` del navegador) y sin `limit(1)` global.
 * Mientras la organización no esté resuelta, la consulta queda deshabilitada.
 */
export async function fetchDefaultContractTemplate(
  organizationId: string,
): Promise<ContractTemplate | null> {
  const { data, error } = await supabase
    .from("contract_templates")
    .select(CONTRACT_TEMPLATE_COLUMNS)
    .eq("organization_id", organizationId)
    .eq("is_default", true)
    .order("updated_at", { ascending: false })
    .limit(2)
    .returns<Tables<"contract_templates">[]>();
  if (error) throw new ContractTemplateUnavailableError("read_error");
  const row = resolveSingleDefaultTemplate(data);
  if (!row) return null;
  return {
    ...row,
    declarations_landlord: parseJsonbArray<string>(row.declarations_landlord),
    declarations_tenant: parseJsonbArray<string>(row.declarations_tenant),
    clauses: parseJsonbArray<ContractClause>(row.clauses),
    checklist_sections: parseJsonbArray<ChecklistSection>(row.checklist_sections),
  } as ContractTemplate;
}

export function useDefaultContractTemplate() {
  const org = useOrganizationContext();
  const organizationId = org.status === "ready" ? org.organizationId : undefined;
  return useQuery({
    queryKey: contractTemplateKeys.default(organizationId),
    staleTime: 60_000,
    enabled: !!organizationId,
    queryFn: async () => {
      if (!organizationId) throw new ContractTemplateUnavailableError("organization_unresolved");
      return fetchDefaultContractTemplate(organizationId);
    },
  });
}

export function useUpdateContractTemplate() {
  return useEntityMutation({
    mutationFn: async (template: Partial<ContractTemplate> & { id: string }) => {
      const { id, ...rest } = template;
      const updatePayload = {
        ...rest,
        updated_at: new Date().toISOString(),
      } as unknown as TablesUpdate<"contract_templates">;
      const { data, error } = await supabase
        .from("contract_templates")
        .update(updatePayload)
        .eq("id", id)
        .select("id");
      if (error) throw error;
      assertRowsAffected(data, "Actualizar plantilla de contrato");
    },
    invalidateKeys: [contractTemplateKeys.all],
    errorTitle: "Error al actualizar plantilla",
  });
}
