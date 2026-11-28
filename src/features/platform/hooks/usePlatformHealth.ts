import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { formatDateTimeMty } from "@/lib/format/dateFormats";
import {
  checkPlatformIntegrationFn,
  getPlatformMonitoringFn,
  listPlatformIntegrationsFn,
} from "../lib/platformHealth.functions";
import { platformKeys } from "../lib/queryKeys";

export function usePlatformMonitoring(enabled = true) {
  return useQuery({
    queryKey: platformKeys.health.monitoring(),
    enabled,
    queryFn: () => getPlatformMonitoringFn(),
    staleTime: 30_000,
  });
}

export function usePlatformIntegrations(search: string, offset: number) {
  return useQuery({
    queryKey: platformKeys.health.integrations(search, offset),
    staleTime: 30_000,
    queryFn: () => listPlatformIntegrationsFn({ data: { search, offset } }),
  });
}

export function useCheckPlatformIntegration() {
  const cache = useQueryClient();
  return useMutation({
    retry: false,
    meta: { silent: true },
    mutationFn: (organizationId: string) =>
      checkPlatformIntegrationFn({
        data: { organizationId, requestId: crypto.randomUUID() },
      }),
    onSettled: () => void cache.invalidateQueries({ queryKey: platformKeys.health.all }),
  });
}

export function healthDate(value: string | null | undefined) {
  return value ? formatDateTimeMty(value) : "Sin registro";
}
