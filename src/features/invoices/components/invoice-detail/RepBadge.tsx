import { StatusBadge } from "@/components/feedback/StatusBadge";

/**
 * v7.217.0 (C11.6): wrapper delgado sobre StatusBadge central para no
 * duplicar mapeos de estilo. Los tokens `stamped`, `cancelled`, `error`,
 * `pending` y `rep_none` ya viven en `statusStyles`/`STATUS_LABELS`.
 */
export function RepBadge({ status }: { status: string | null }) {
  const key = status && status !== "none" ? status : "rep_none";
  return <StatusBadge status={key} />;
}
