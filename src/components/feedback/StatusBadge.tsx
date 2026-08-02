import { Badge } from "@/components/ui/badge";
import { STATUS_LABELS } from "@/lib/constants";
import { cn } from "@/lib/utils";

// Bloque 3 (R5): tono suave (bg tintado /10 + texto de color) para mejorar
// contraste y evitar bloques sólidos saturados en tablas densas.
// R12-UIX-02: patrón unificado punto de color + etiqueta en --foreground.
// El fondo tintado al 10% y el borde al 20% mantienen la jerarquía sin
// bloques saturados; el color vive en el punto, así el texto siempre cumple
// contraste AA (incluye "Vencido", antes ~3.9:1).
const SUCCESS = "bg-success/10 border-success/20 [--dot:hsl(var(--success))]";
const INFO = "bg-info/10 border-info/20 [--dot:hsl(var(--info))]";
const WARNING = "bg-warning/10 border-warning/25 [--dot:hsl(var(--warning))]";
const DANGER = "bg-destructive/10 border-destructive/25 [--dot:hsl(var(--destructive))]";
const NEUTRAL_DARK = "bg-muted border-border [--dot:hsl(var(--status-completed))]";
const NEUTRAL_LIGHT = "bg-muted/60 border-border [--dot:hsl(var(--muted-foreground))]";
// Estados terminales (Vendido, Cancelado, Retirado): punto hueco/apagado.
const NEUTRAL_SOLID = "bg-muted border-border opacity-80 [--dot:hsl(var(--muted-foreground))]";

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
  resolved: SUCCESS,
  stamped: SUCCESS,
  // info (azul)
  rented: INFO,
  sent: INFO,
  scheduled: INFO,
  delivery: INFO,
  invoiced: INFO,
  new: INFO,
  // warning (ámbar)
  maintenance: WARNING,
  partial: WARNING,
  pending: WARNING,
  minor_damage: WARNING,
  reported: WARNING,
  in_repair: WARNING,
  in_progress: WARNING,
  triage: WARNING,
  pickup: WARNING,
  // danger (rojo)
  overdue: DANGER,
  major_damage: DANGER,
  needs_repair: DANGER,
  rejected: DANGER,
  error: DANGER,
  // terminal (neutral sólido apagado)
  cancelled: NEUTRAL_SOLID,
  sold: NEUTRAL_SOLID,
  retired: NEUTRAL_SOLID,
  closed: NEUTRAL_SOLID,
  // neutral suave (borradores / inactivos temporales)
  draft: NEUTRAL_LIGHT,
  expired: NEUTRAL_LIGHT,
  inactive: NEUTRAL_LIGHT,
  duplicate: NEUTRAL_LIGHT,
  rep_none: NEUTRAL_LIGHT,
  completed: NEUTRAL_DARK,
};

export function StatusBadge({ status, label: labelOverride }: { status: string; label?: string }) {
  const className = statusStyles[status] || NEUTRAL_LIGHT;
  const label = labelOverride || STATUS_LABELS[status] || status.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  return (
    <Badge className={cn("gap-1.5 whitespace-nowrap font-medium text-foreground", className)}>
      <span aria-hidden className="h-1.5 w-1.5 shrink-0 rounded-full bg-[color:var(--dot)]" />
      {label}
    </Badge>
  );
}
