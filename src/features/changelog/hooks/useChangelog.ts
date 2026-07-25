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

/**
 * R-Perf P0-3.3: la versión que se muestra en el sidebar viene de
 * `VITE_APP_VERSION` (inyectado en build desde public/version.json — 72B),
 * NO de `useChangelog()` (que descarga 132 KB gz solo para leer `data[0].version`).
 * `useChangelog` queda restringido a `/changelog` y al contexto de feedback.
 */
export function useCurrentVersion(): string | null {
  const v = import.meta.env.VITE_APP_VERSION as string | undefined;
  if (v && v !== "unknown") return v;
  // Fallback defensivo si el prebuild no corrió (dev local sin gen-version).
  return null;
}

/** Referencia mantenida para compat: usa `getCurrentVersion` sobre el índice cargado. */
export function _getCurrentVersionFromChangelog(entries: Parameters<typeof getCurrentVersion>[0]) {
  return getCurrentVersion(entries);
}
