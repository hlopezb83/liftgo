import { useQuery } from "@tanstack/react-query";
import { getPlatformMonitoringFn } from "@/lib/platformHealth.functions";

export function usePlatformMonitoring(enabled = true) {
  return useQuery({ queryKey: ["platform", "health", "monitoring"], enabled,
    queryFn: () => getPlatformMonitoringFn(), staleTime: 30_000 });
}
export function healthDate(value: string | null | undefined) {
  return value ? new Date(value).toLocaleString("es-MX") : "Sin registro";
}
