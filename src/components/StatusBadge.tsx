import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { STATUS_LABELS } from "@/lib/constants";

// Tonos semánticos:
// - success (verde): available, paid, accepted, confirmed, repaired, good, active, signed
// - info    (azul):  rented, sent, scheduled, delivery, invoiced
// - warning (ámbar): maintenance, partial, pending, minor_damage, reported, in_repair, pickup
// - danger  (rojo):  overdue, cancelled, declined, major_damage, needs_repair
// - neutral (gris):  draft, retired, expired, completed, sold, inactive
const SUCCESS = "bg-status-available text-white border-transparent";
const INFO = "bg-status-rented text-white border-transparent";
const WARNING = "bg-status-warning text-foreground border-transparent dark:text-background";
const DANGER = "bg-destructive text-destructive-foreground border-transparent";
const NEUTRAL_DARK = "bg-status-completed text-white border-transparent";
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
