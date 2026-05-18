import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { useEffect } from "react";
import { fetchChangelogIndex, fetchChangelogDetail, getCurrentVersion } from "@/features/changelog/lib/changelog";

export function useChangelog() {
  const query = useQuery({
    queryKey: ["changelog", "index"],
    queryFn: fetchChangelogIndex,
    staleTime: Infinity,
    gcTime: Infinity,
    retry: 2,
  });
  useEffect(() => {
    if (query.error) toast.error("No se pudo cargar el historial de cambios");
  }, [query.error]);
  return query;
}

export function useChangelogEntry(version: string | null, enabled = true) {
  return useQuery({
    queryKey: ["changelog", "detail", version],
    queryFn: () => fetchChangelogDetail(version ?? ""),
    enabled: enabled && !!version,
    staleTime: Infinity,
    gcTime: Infinity,
    retry: 1,
  });
}

export function useCurrentVersion(): string | null {
  const { data } = useChangelog();
  if (!data) return null;
  return getCurrentVersion(data);
}
