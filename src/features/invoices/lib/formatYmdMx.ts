/** "2026-10-01" → "01/10/2026" (formato mexicano, sin corrimiento por zona horaria). */
export function formatYmdMx(ymd: string | null | undefined): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(ymd ?? "");
  return m ? `${m[3]}/${m[2]}/${m[1]}` : "";
}
