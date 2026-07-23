import { StatusBadge } from "@/components/feedback/StatusBadge";
import { FEEDBACK_STATUS_LABELS, type FeedbackStatus } from "../lib/constants";

/**
 * v7.217.0 (C11.6): wrapper delgado sobre StatusBadge central. Los estilos
 * (success/warning/info/danger/neutral) provienen ya del mapa unificado; sólo
 * conservamos los labels específicos del dominio feedback como override.
 */
export function FeedbackStatusBadge({ status }: { status: string }) {
  const s = status as FeedbackStatus;
  return <StatusBadge status={status} label={FEEDBACK_STATUS_LABELS[s]} />;
}
