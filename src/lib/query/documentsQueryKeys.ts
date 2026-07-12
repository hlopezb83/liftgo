import { defineEntityQueries } from "@/lib/query/defineEntityQueries";
import { supabase } from "@/integrations/supabase/client";

const SIGNED_URL_TTL_SECONDS = 60 * 60; // 1h

function extractStoragePath(fileUrl: string): string | null {
  const marker = "/documents/";
  const idx = fileUrl.indexOf(marker);
  if (idx === -1) return null;
  return fileUrl.slice(idx + marker.length);
}

export { extractStoragePath };

async function attachSignedUrls<T extends { file_url: string }>(rows: T[]): Promise<T[]> {
  return Promise.all(
    rows.map(async (row) => {
      const path = extractStoragePath(row.file_url);
      if (!path) return row;
      const { data } = await supabase.storage
        .from("documents")
        .createSignedUrl(path, SIGNED_URL_TTL_SECONDS);
      return data?.signedUrl ? { ...row, file_url: data.signedUrl } : row;
    }),
  );
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
