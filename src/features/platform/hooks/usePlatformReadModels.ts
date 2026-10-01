import { useQuery } from "@tanstack/react-query";
import { listPlatformAuditEventsFn } from "@/lib/platformAudit.functions";
import type { PlatformAuditInput } from "@/lib/platformAudit.types";
import { getPlatformOrganizationDetailFn } from "@/lib/platformOrganizationDetail.functions";

export const platformReadKeys = {
  all: ["platform", "read-models"] as const,
  detail: (id: string) =>
    [...platformReadKeys.all, "organization", id] as const,
  audit: (input: PlatformAuditInput) =>
    [...platformReadKeys.all, "audit", input] as const,
};

export function usePlatformOrganizationDetail(organizationId: string) {
  return useQuery({
    queryKey: platformReadKeys.detail(organizationId),
    staleTime: 30_000,
    queryFn: () =>
      getPlatformOrganizationDetailFn({
        data: { organization_id: organizationId },
      }),
  });
}

export function usePlatformAudit(input: PlatformAuditInput, enabled = true) {
  return useQuery({
    queryKey: platformReadKeys.audit(input),
    staleTime: 30_000,
    enabled,
    queryFn: () => listPlatformAuditEventsFn({ data: input }),
  });
}
