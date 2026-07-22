// R7 Bloque 19d: reglas puras para adjuntos de flota.

export const DOC_ACCEPT = "application/pdf,image/*";
export const DOC_MAX_BYTES = 5 * 1024 * 1024; // 5MB

export function isAllowedDocument(file: { type: string; size: number }): boolean {
  const okType = file.type === "application/pdf" || file.type.startsWith("image/");
  return okType && file.size <= DOC_MAX_BYTES;
}

export function partitionFiles<T extends { type: string; size: number }>(
  files: ReadonlyArray<T>,
): { accepted: T[]; rejected: T[] } {
  const accepted: T[] = [];
  const rejected: T[] = [];
  for (const f of files) (isAllowedDocument(f) ? accepted : rejected).push(f);
  return { accepted, rejected };
}
