import { useQuery } from "@tanstack/react-query";
import { useVerifiedOrganizationId } from "@/contexts/OrganizationContext";
import { operationSummaryKeys } from "@/lib/query/operationSummaryKeys";
import { callRpc } from "@/lib/rpc";

/** Identidad mínima de la empresa activa, sin consultar sus datos fiscales. */
export function useSidebarOrganizationName() {
  const organizationId = useVerifiedOrganizationId();
  return useQuery({
    queryKey: operationSummaryKeys.sidebarOrganizationName.byOrg(organizationId),
    enabled: !!organizationId,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      if (!organizationId) throw new Error("Organización no verificada");
      return callRpc<string>("get_organization_display_name");
    },
  });
}
