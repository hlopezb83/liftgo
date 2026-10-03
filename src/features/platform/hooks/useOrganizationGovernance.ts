import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getPlatformOrganizationGovernanceFn, listPlatformOrganizationGovernanceFn, setPlatformOrganizationGovernanceFn,
} from "@/lib/platformOrganizationGovernance.functions";
import type { OrganizationGovernanceInput } from "@/lib/platformOrganizationGovernance.types";
import { notifyError, notifyInfo, notifySuccess } from "@/lib/ui/appFeedback";

export const organizationGovernanceKeys = {
  list: ["platform", "organization-governance"] as const,
  detail: (id: string) => ["platform", "organization-governance", id] as const,
};
export function useOrganizationGovernanceList(enabled: boolean) {
  return useQuery({
    queryKey: organizationGovernanceKeys.list, enabled, staleTime: 30_000,
    queryFn: () => listPlatformOrganizationGovernanceFn(),
  });
}
export function useOrganizationGovernance(organizationId: string) {
  return useQuery({
    queryKey: organizationGovernanceKeys.detail(organizationId), enabled: !!organizationId, staleTime: 30_000,
    queryFn: () => getPlatformOrganizationGovernanceFn({ data: { organizationId } }),
  });
}
export function useSetOrganizationGovernance() {
  const cache = useQueryClient();
  return useMutation({
    mutationFn: (input: OrganizationGovernanceInput) => setPlatformOrganizationGovernanceFn({ data: input }),
    onSuccess: (result) => {
      cache.setQueryData(organizationGovernanceKeys.detail(result.governance.organizationId), result.governance);
      void cache.invalidateQueries({ queryKey: ["platform"] });
      if (result.changed) notifySuccess("Datos de la empresa actualizados");
      else notifyInfo("La empresa ya tiene estos datos");
    },
    onError: (error) => notifyError({ error, title: "No se pudieron guardar los datos de la empresa", phase: "mutation" }),
  });
}
