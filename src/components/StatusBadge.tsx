import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { STATUS_LABELS } from "@/lib/constants";

const statusStyles: Record<string, string> = {
  available: "bg-status-available text-white border-transparent",
  rented: "bg-status-rented text-white border-transparent",
  maintenance: "bg-status-maintenance text-white border-transparent",
  retired: "bg-status-retired text-white border-transparent",
  draft: "bg-muted text-muted-foreground border-transparent",
  sent: "bg-status-rented text-white border-transparent",
  paid: "bg-status-available text-white border-transparent",
  overdue: "bg-destructive text-destructive-foreground border-transparent",
  confirmed: "bg-status-available text-white border-transparent",
  accepted: "bg-status-available text-white border-transparent",
  declined: "bg-destructive text-destructive-foreground border-transparent",
  expired: "bg-status-retired text-white border-transparent",
  completed: "bg-status-available text-white border-transparent",
  reported: "bg-status-maintenance text-white border-transparent",
  in_repair: "bg-status-maintenance text-white border-transparent",
  repaired: "bg-status-available text-white border-transparent",
  invoiced: "bg-status-rented text-white border-transparent",
  good: "bg-status-available text-white border-transparent",
  minor_damage: "bg-status-maintenance text-white border-transparent",
  major_damage: "bg-destructive text-destructive-foreground border-transparent",
  needs_repair: "bg-destructive text-destructive-foreground border-transparent",
  active: "bg-status-available text-white border-transparent",
  inactive: "bg-status-retired text-white border-transparent",
  sold: "bg-status-sold text-white border-transparent",
  signed: "bg-status-available text-white border-transparent",
  cancelled: "bg-destructive text-destructive-foreground border-transparent",
  partial: "bg-status-maintenance text-white border-transparent",
  scheduled: "bg-status-rented text-white border-transparent",
  pending: "bg-status-maintenance text-white border-transparent",
  delivery: "bg-status-rented text-white border-transparent",
  pickup: "bg-status-maintenance text-white border-transparent",
};

export function StatusBadge({ status }: { status: string }) {
  const className = statusStyles[status] || "bg-muted text-muted-foreground border-transparent";
  const label = STATUS_LABELS[status] || status.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  return <Badge className={cn(className)}>{label}</Badge>;
}
