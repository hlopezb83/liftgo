import { createEntityKeys } from "@/lib/query/createEntityKeys";

export function extractStoragePath(fileUrl: string): string | null {
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

export interface DocumentsFilter extends Record<string, unknown> {
  entityType: string;
  entityId: string | undefined;
}

export const documentsKeys = createEntityKeys("documents");
