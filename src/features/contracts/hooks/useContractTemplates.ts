import { useQuery } from "@tanstack/react-query";
import { useOrganizationContext } from "@/contexts/OrganizationContext";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import { useEntityMutation } from "@/lib/hooks/useEntityMutation";
import { ContractTemplateUnavailableError } from "../lib/contractTemplateResolution";
import {
  normalizeLegalTemplateOverrides,
  type LegalTemplateOverrides,
} from "../lib/legalTemplateOverrides";
import { contractTemplateKeys } from "../lib/queryKeys";
import { fetchDefaultContractTemplate } from "./contractTemplateData";
export { fetchDefaultContractTemplate } from "./contractTemplateData";
export type { ContractTemplate } from "./contractTemplateData";
export type { ContractClause, ChecklistSection } from "../lib/contractTypes";

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

export function useUpdateLegalTemplateOverrides() {
  return useEntityMutation({
    mutationFn: async ({
      definitionId,
      overrides,
    }: {
      definitionId: string;
      overrides: LegalTemplateOverrides;
    }) => {
      const { data, error } = await supabase.rpc(
        "update_current_organization_legal_template_overrides",
        { p_definition_id: definitionId, p_local_overrides: overrides as unknown as Json },
      );
      if (error) throw error;
      return normalizeLegalTemplateOverrides(data);
    },
    invalidateKeys: [contractTemplateKeys.all],
    successMsg: "Datos legales de la empresa guardados",
    errorTitle: "No se pudieron guardar los datos legales",
  });
}

