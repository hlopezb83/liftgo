import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { notifyError } from "@/lib/ui/appFeedback";
import { fetchChangelogIndex, fetchChangelogDetail, getCurrentVersion } from "../lib/changelog";

export function useChangelog() {
  const query = useQuery({
    queryKey: ["changelog", "index"],
    queryFn: fetchChangelogIndex,
    staleTime: Infinity,
    gcTime: Infinity,
    retry: 2,
  });
  useEffect(() => {
    if (query.error) notifyError({ error: query.error, message: "No se pudo cargar el historial de cambios" });
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
