import { supabase } from "@/integrations/supabase/client";
import { defineEntityQueries } from "@/lib/query/defineEntityQueries";

const SIGNED_URL_TTL_SECONDS = 60 * 60; // 1h

function extractStoragePath(fileUrl: string): string | null {
  const marker = "/documents/";
  const idx = fileUrl.indexOf(marker);
  if (idx === -1) return null;
  return fileUrl.slice(idx + marker.length);
}

export { extractStoragePath };

async function attachSignedUrls<T extends { file_url: string }>(rows: T[]): Promise<T[]> {
  if (rows.length === 0) return rows;
  // Bulk: una sola llamada a Storage por hasta 100 paths, en vez de N round-trips.
  const paths: (string | null)[] = rows.map((r) => extractStoragePath(r.file_url));
  const validPaths = paths.filter((p): p is string => p !== null);
  if (validPaths.length === 0) return rows;

  const { data, error } = await supabase.storage
    .from("documents")
    .createSignedUrls(validPaths, SIGNED_URL_TTL_SECONDS);
  if (error || !data) return rows;

  const byPath = new Map<string, string>();
  for (const entry of data) {
    if (entry.path && entry.signedUrl) byPath.set(entry.path, entry.signedUrl);
  }
  return rows.map((row, i) => {
    const p = paths[i];
    const signed = p ? byPath.get(p) : undefined;
    return signed ? { ...row, file_url: signed } : row;
  });
}

export interface DocumentsFilter extends Record<string, unknown> {
  entityType: string;
  entityId: string | undefined;
}

export const documentsQueries = defineEntityQueries("documents", {
  list: (filter?: Readonly<Record<string, unknown>>) => async () => {
    const { entityType, entityId } = (filter ?? {}) as DocumentsFilter;
    const { data, error } = await supabase
      .from("documents")
      .select("*")
      .eq("entity_type", entityType)
      .eq("entity_id", entityId ?? "")
      .order("created_at", { ascending: false });
    if (error) throw error;
    return attachSignedUrls(data ?? []);
  },
  staleTime: 60_000,
});
