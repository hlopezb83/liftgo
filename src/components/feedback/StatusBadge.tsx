import { Badge } from "@/components/ui/badge";
import { STATUS_LABELS } from "@/lib/constants";
import { cn } from "@/lib/utils";

// Bloque 3 (R5): tono suave (bg tintado /10 + texto de color) para mejorar
// contraste y evitar bloques sólidos saturados en tablas densas.
const SUCCESS = "bg-success/10 text-success border-success/20";
const INFO = "bg-info/10 text-info border-info/20";
const WARNING = "bg-warning/10 text-warning border-warning/20";
const DANGER = "bg-destructive/15 text-destructive border border-destructive/30";
const NEUTRAL_DARK = "bg-status-completed/15 text-foreground border-transparent";
const NEUTRAL_LIGHT = "bg-muted text-muted-foreground border-transparent";

const statusStyles: Record<string, string> = {
  // success
  available: SUCCESS,
  paid: SUCCESS,
  accepted: SUCCESS,
  confirmed: SUCCESS,
  repaired: SUCCESS,
  good: SUCCESS,
  active: SUCCESS,
  signed: SUCCESS,
  // info (azul)
  rented: INFO,
  sent: INFO,
  scheduled: INFO,
  delivery: INFO,
  invoiced: INFO,
  // warning (ámbar)
  maintenance: WARNING,
  partial: WARNING,
  pending: WARNING,
  minor_damage: WARNING,
  reported: WARNING,
  in_repair: WARNING,
  pickup: WARNING,
  // danger (rojo)
  overdue: DANGER,
  cancelled: DANGER,
  declined: DANGER,
  major_damage: DANGER,
  needs_repair: DANGER,
  // neutral
  draft: NEUTRAL_LIGHT,
  retired: NEUTRAL_LIGHT,
  expired: NEUTRAL_LIGHT,
  inactive: NEUTRAL_LIGHT,
  completed: NEUTRAL_DARK,
  sold: NEUTRAL_DARK,
};

export function StatusBadge({ status, label: labelOverride }: { status: string; label?: string }) {
  const className = statusStyles[status] || "bg-muted text-muted-foreground border-transparent";
  const label = labelOverride || STATUS_LABELS[status] || status.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  return <Badge className={cn(className)}>{label}</Badge>;
}
