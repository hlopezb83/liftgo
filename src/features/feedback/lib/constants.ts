/**
 * Constantes del módulo Feedback.
 * Labels y opciones de severidad/tipo/estado.
 */

export type FeedbackType = "bug" | "improvement";
export type FeedbackSeverity = "critical" | "high" | "medium" | "low";
export type FeedbackStatus =
  | "new"
  | "triage"
  | "accepted"
  | "in_progress"
  | "resolved"
  | "closed"
  | "rejected"
  | "duplicate";

export const FEEDBACK_TYPE_LABELS: Record<FeedbackType, string> = {
  bug: "Bug",
  improvement: "Mejora",
};

export const FEEDBACK_SEVERITY_LABELS: Record<FeedbackSeverity, string> = {
  critical: "Crítica",
  high: "Alta",
  medium: "Media",
  low: "Baja",
};

export const FEEDBACK_STATUS_LABELS: Record<FeedbackStatus, string> = {
  new: "Nuevo",
  triage: "Triage",
  accepted: "Aceptado",
  in_progress: "En progreso",
  resolved: "Resuelto",
  closed: "Cerrado",
  rejected: "Rechazado",
  duplicate: "Duplicado",
};

export const KANBAN_COLUMNS: FeedbackStatus[] = [
  "new",
  "triage",
  "accepted",
  "in_progress",
  "resolved",
  "closed",
];
