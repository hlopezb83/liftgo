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

export const STAGE_LABELS: Record<string, string> = {
  nuevo_prospecto: "Nuevo Prospecto",
  contactado: "Contactado",
  cotizacion_enviada: "Cotización Enviada",
  negociacion: "Negociación",
  cerrado_ganado: "Cerrado Ganado",
  cerrado_perdido: "Cerrado Perdido",
};

export const ACTIVE_STAGES = [
  { key: "nuevo_prospecto", label: "Nuevo Prospecto", color: "hsl(var(--primary))" },
  { key: "contactado", label: "Contactado", color: "hsl(210 80% 55%)" },
  { key: "cotizacion_enviada", label: "Cotización Enviada", color: "hsl(45 93% 47%)" },
  { key: "negociacion", label: "Negociación", color: "hsl(280 60% 55%)" },
] as const;

export const VALUE_RANGE_OPTIONS = [
  { value: "all", label: "Cualquier valor" },
  { value: "lt100k", label: "< $100k" },
  { value: "100k-500k", label: "$100k–$500k" },
  { value: "gt500k", label: "> $500k" },
] as const;

export const AGE_RANGE_OPTIONS = [
  { value: "all", label: "Cualquier antigüedad" },
  { value: "week", label: "Esta semana" },
  { value: "month", label: "Este mes" },
  { value: "stale", label: "> 30 días" },
] as const;
