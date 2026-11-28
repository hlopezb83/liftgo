import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { notifyError, notifyInfo, notifySuccess } from "@/lib/ui/appFeedback";
import {
  getPlatformOrganizationGovernanceFn,
  listPlatformOrganizationGovernanceFn,
  setPlatformOrganizationGovernanceFn,
} from "../lib/platformOrganizationGovernance.functions";
import { platformKeys } from "../lib/queryKeys";
import type { OrganizationGovernanceInput } from "../lib/platformOrganizationGovernance.types";

export function useOrganizationGovernanceList(enabled: boolean) {
  return useQuery({
    queryKey: platformKeys.organizationGovernance.all,
    enabled,
    staleTime: 30_000,
    queryFn: () => listPlatformOrganizationGovernanceFn(),
  });
}

export function useOrganizationGovernance(organizationId: string) {
  return useQuery({
    queryKey: platformKeys.organizationGovernance.detail(organizationId),
    enabled: !!organizationId,
    staleTime: 30_000,
    queryFn: () => getPlatformOrganizationGovernanceFn({ data: { organizationId } }),
  });
}

export function useSetOrganizationGovernance() {
  const cache = useQueryClient();
  return useMutation({
    mutationFn: (input: OrganizationGovernanceInput) => setPlatformOrganizationGovernanceFn({ data: input }),
    onSuccess: (result) => {
      cache.setQueryData(platformKeys.organizationGovernance.detail(result.governance.organizationId), result.governance);
      void cache.invalidateQueries({ queryKey: platformKeys.all });
      if (result.changed) notifySuccess("Datos de la empresa actualizados");
      else notifyInfo("La empresa ya tiene estos datos");
    },
    onError: (error) => notifyError({ error, title: "No se pudieron guardar los datos de la empresa", phase: "mutation" }),
  });
}
