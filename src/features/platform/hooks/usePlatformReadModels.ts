import { useQuery } from "@tanstack/react-query";
import { listPlatformAuditEventsFn } from "../lib/platformAudit.functions";
import { getPlatformOrganizationDetailFn } from "../lib/platformOrganizationDetail.functions";
import { platformKeys } from "../lib/queryKeys";
import type { PlatformAuditInput } from "../lib/platformAudit.types";

export function usePlatformOrganizationDetail(organizationId: string) {
  return useQuery({
    queryKey: platformKeys.readModels.detail(organizationId),
    staleTime: 30_000,
    queryFn: () =>
      getPlatformOrganizationDetailFn({
        data: { organization_id: organizationId },
      }),
  });
}

export function usePlatformAudit(input: PlatformAuditInput, enabled = true) {
  return useQuery({
    queryKey: platformKeys.readModels.audit(input),
    staleTime: 30_000,
    enabled,
    queryFn: () => listPlatformAuditEventsFn({ data: input }),
  });
}
