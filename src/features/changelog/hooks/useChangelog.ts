import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { notifyError } from "@/lib/ui/appFeedback";
import { getCurrentVersion } from "../lib/changelog";
import { changelogQueries } from "../lib/queryKeys";

export function useChangelog() {
  const query = useQuery({
    ...changelogQueries.list(),
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
    ...changelogQueries.detail(version ?? ""),
    enabled: enabled && !!version,
    gcTime: Infinity,
    retry: 1,
  });
}

export function useCurrentVersion(): string | null {
  const { data } = useChangelog();
  if (!data) return null;
  return getCurrentVersion(data);
}
