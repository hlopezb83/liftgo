import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const statusConfig: Record<string, { label: string; className: string }> = {
  available: { label: "Available", className: "bg-status-available text-white border-transparent" },
  rented: { label: "Rented", className: "bg-status-rented text-white border-transparent" },
  maintenance: { label: "Maintenance", className: "bg-status-maintenance text-white border-transparent" },
  retired: { label: "Retired", className: "bg-status-retired text-white border-transparent" },
};

export function StatusBadge({ status }: { status: string }) {
  const config = statusConfig[status] || { label: status, className: "" };
  return <Badge className={cn(config.className)}>{config.label}</Badge>;
}
