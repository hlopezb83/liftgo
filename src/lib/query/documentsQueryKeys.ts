import { supabase } from "@/integrations/supabase/client";
import { defineEntityQueries } from "@/lib/query/defineEntityQueries";

const SIGNED_URL_TTL_SECONDS = 60 * 60; // 1h

function extractStoragePath(fileUrl: string): string | null {
  const relativePrefix = "documents/";
  if (fileUrl.startsWith(relativePrefix)) {
    return fileUrl.slice(relativePrefix.length) || null;
  }
  let source = fileUrl;
  try { source = new URL(fileUrl).pathname; } catch { /* Legacy relative URL. */ }
  const marker = "/documents/";
  const idx = source.indexOf(marker);
  if (idx === -1) return null;
  return source.slice(idx + marker.length) || null;
}

export { extractStoragePath };

function documentSigningPath(fileUrl: string): string | null {
  try {
    const url = new URL(fileUrl);
    // External links are not Storage objects, even if their path contains /documents/.
    if (!/^\/storage\/v1\/object\/(?:public|sign|authenticated)\/documents\//.test(url.pathname)) return null;
  } catch { /* Relative Storage paths retain the legacy extraction. */ }
  return extractStoragePath(fileUrl);
}

async function attachSignedUrls<T extends { file_url: string }>(rows: T[]): Promise<T[]> {
  if (rows.length === 0) return rows;
  // Bulk: una sola llamada a Storage por hasta 100 paths, en vez de N round-trips.
  const paths: (string | null)[] = rows.map((r) => documentSigningPath(r.file_url));
  const validPaths = paths.filter((p): p is string => p !== null);
  if (validPaths.length === 0) return rows;

  const { data, error } = await supabase.storage
    .from("documents")
    .createSignedUrls(validPaths, SIGNED_URL_TTL_SECONDS);
  if (error) throw error;
  if (!data) throw new Error("No se pudieron generar los enlaces de los adjuntos. Reintenta la consulta.");

  const byPath = new Map<string, string>();
  for (const entry of data) {
    if (!entry.error && entry.path && entry.signedUrl) byPath.set(entry.path, entry.signedUrl);
  }
  return rows.map((row, i) => {
    const p = paths[i];
    if (!p) return row;
    const signed = byPath.get(p);
    if (!signed) throw new Error("No se pudieron generar todos los enlaces de los adjuntos. Reintenta la consulta.");
    return { ...row, file_url: signed };
  });
}

export interface DocumentsFilter extends Record<string, unknown> {
  entityType: string;
  entityId: string | undefined;
}

export const documentsQueries = defineEntityQueries("documents", {
  list: (filter?: Readonly<Record<string, unknown>>) => async () => {
    const { entityType, entityId } = (filter ?? {}) as DocumentsFilter;
    // v7.216.0 (C6): columnas explícitas.
    const { data, error } = await supabase
      .from("documents")
      .select("id, entity_type, entity_id, file_name, file_url, file_size, mime_type, uploaded_by, created_at")
      .eq("entity_type", entityType)
      .eq("entity_id", entityId ?? "")
      .order("created_at", { ascending: false });
    if (error) throw error;
    return attachSignedUrls(data ?? []);
  },
  // Las signed URLs incrustadas en las filas viven SIGNED_URL_TTL_SECONDS (1h).
  // El staleTime debe quedar por debajo del TTL con margen para no servir URLs
  // expiradas desde el caché (50 min < 60 min).
  staleTime: 50 * 60_000,
});
