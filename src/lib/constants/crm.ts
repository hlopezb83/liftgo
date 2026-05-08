export const LOST_REASONS = [
  { value: "precio", label: "Precio" },
  { value: "competencia", label: "Competencia" },
  { value: "timing", label: "Timing" },
  { value: "sin_presupuesto", label: "Sin presupuesto" },
  { value: "no_responde", label: "No responde" },
  { value: "otro", label: "Otro" },
] as const;

export type LostReason = (typeof LOST_REASONS)[number]["value"];

export const LOST_REASON_LABELS: Record<string, string> = Object.fromEntries(
  LOST_REASONS.map((r) => [r.value, r.label])
);

export const ACTIVE_STAGE_KEYS = [
  "nuevo_prospecto",
  "contactado",
  "cotizacion_enviada",
  "negociacion",
] as const;

export const CLOSED_STAGE_KEYS = ["cerrado_ganado", "cerrado_perdido"] as const;

export const STAGE_LABELS: Record<string, string> = {
  nuevo_prospecto: "Nuevo Prospecto",
  contactado: "Contactado",
  cotizacion_enviada: "Cotización Enviada",
  negociacion: "Negociación",
  cerrado_ganado: "Cerrado Ganado",
  cerrado_perdido: "Cerrado Perdido",
};
