/**
 * Reglas de puntuación documentadas para transparencia.
 * La asignación real ocurre en la RPC `change_feedback_status`.
 */
import type { FeedbackSeverity, FeedbackType } from "./constants";

export interface ScoringRule {
  label: string;
  points: number | string;
}

export const SCORING_RULES: ScoringRule[] = [
  { label: "Bug aceptado", points: 5 },
  { label: "Mejora aceptada", points: 3 },
  { label: "Bug resuelto (severidad media/baja)", points: 15 },
  { label: "Bug resuelto (severidad alta)", points: 23 },
  { label: "Bug resuelto (severidad crítica)", points: 30 },
  { label: "Mejora implementada", points: 10 },
  { label: "Reporte rechazado o duplicado", points: 0 },
];

export function expectedPoints(
  type: FeedbackType,
  status: "accepted" | "resolved",
  severity?: FeedbackSeverity,
): number {
  if (status === "accepted") return type === "bug" ? 5 : 3;
  if (type !== "bug") return 10;
  const mult = severity === "critical" ? 2 : severity === "high" ? 1.5 : 1;
  return Math.round(15 * mult);
}
