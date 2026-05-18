import { translateField, HIDDEN_DIFF_FIELDS } from "./auditTrailConstants";

export function visibleFields(fields: string[] | null | undefined): string[] {
  return (fields ?? []).filter((f) => !HIDDEN_DIFF_FIELDS.has(f));
}

export function visibleSnapshot(
  data: Record<string, unknown> | null | undefined,
): [string, unknown][] {
  if (!data) return [];
  return Object.entries(data)
    .filter(([k, v]) => !HIDDEN_DIFF_FIELDS.has(k) && v !== null && v !== "")
    .sort(([a], [b]) => translateField(a).localeCompare(translateField(b)));
}
