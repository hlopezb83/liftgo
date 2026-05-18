/**
 * Constantes del módulo Feedback.
 * Listas de módulos disponibles, labels y opciones de severidad/tipo/estado.
 */

export const FEEDBACK_INTERNAL_MODULES = [
  "Sin clasificar",
  "Dashboard",
  "Calendario",
  "CRM",
  "Clientes",
  "Cotizaciones",
  "Reservas",
  "Contratos",
  "Entregas",
  "Devoluciones",
  "Facturas",
  "Equipos / Flota",
  "Mantenimiento",
  "Daños",
  "Refacciones",
  "Proveedores",
  "Gastos Operativos",
  "Estado de Resultados",
  "Reportes",
  "Actividad",
  "Bitácora",
  "Configuración",
  "Gestión de Usuarios",
  "Changelog",
  "Ayuda",
  "Otro / General",
] as const;

export const FEEDBACK_PORTAL_MODULES = [
  "Sin clasificar",
  "Panel del Cliente",
  "Mis Rentas",
  "Mis Facturas",
  "Mis Contratos",
  "Otro / General",
] as const;

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
