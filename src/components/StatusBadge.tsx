import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const statusConfig: Record<string, { label: string; className: string }> = {
  available: { label: "Available", className: "bg-status-available text-white border-transparent" },
  rented: { label: "Rented", className: "bg-status-rented text-white border-transparent" },
  maintenance: { label: "Maintenance", className: "bg-status-maintenance text-white border-transparent" },
  retired: { label: "Retired", className: "bg-status-retired text-white border-transparent" },
  draft: { label: "Draft", className: "bg-muted text-muted-foreground border-transparent" },
  sent: { label: "Sent", className: "bg-status-rented text-white border-transparent" },
  paid: { label: "Paid", className: "bg-status-available text-white border-transparent" },
  overdue: { label: "Overdue", className: "bg-destructive text-destructive-foreground border-transparent" },
  confirmed: { label: "Confirmed", className: "bg-status-available text-white border-transparent" },
  accepted: { label: "Accepted", className: "bg-status-available text-white border-transparent" },
  declined: { label: "Declined", className: "bg-destructive text-destructive-foreground border-transparent" },
  expired: { label: "Expired", className: "bg-status-retired text-white border-transparent" },
  completed: { label: "Completed", className: "bg-status-available text-white border-transparent" },
  reported: { label: "Reported", className: "bg-status-maintenance text-white border-transparent" },
  in_repair: { label: "In Repair", className: "bg-status-maintenance text-white border-transparent" },
  repaired: { label: "Repaired", className: "bg-status-available text-white border-transparent" },
  invoiced: { label: "Invoiced", className: "bg-status-rented text-white border-transparent" },
  good: { label: "Good", className: "bg-status-available text-white border-transparent" },
  minor_damage: { label: "Minor Damage", className: "bg-status-maintenance text-white border-transparent" },
  major_damage: { label: "Major Damage", className: "bg-destructive text-destructive-foreground border-transparent" },
  needs_repair: { label: "Needs Repair", className: "bg-destructive text-destructive-foreground border-transparent" },
};

export function StatusBadge({ status }: { status: string }) {
  const config = statusConfig[status] || {
    label: status.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
    className: "bg-muted text-muted-foreground border-transparent",
  };
  return <Badge className={cn(config.className)}>{config.label}</Badge>;
}
