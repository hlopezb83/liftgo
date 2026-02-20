import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const statusConfig: Record<string, { label: string; className: string }> = {
  available: { label: "Disponible", className: "bg-status-available text-white border-transparent" },
  rented: { label: "Rentado", className: "bg-status-rented text-white border-transparent" },
  maintenance: { label: "Mantenimiento", className: "bg-status-maintenance text-white border-transparent" },
  retired: { label: "Retirado", className: "bg-status-retired text-white border-transparent" },
  draft: { label: "Borrador", className: "bg-muted text-muted-foreground border-transparent" },
  sent: { label: "Enviado", className: "bg-status-rented text-white border-transparent" },
  paid: { label: "Pagado", className: "bg-status-available text-white border-transparent" },
  overdue: { label: "Vencido", className: "bg-destructive text-destructive-foreground border-transparent" },
  confirmed: { label: "Confirmado", className: "bg-status-available text-white border-transparent" },
  accepted: { label: "Aceptado", className: "bg-status-available text-white border-transparent" },
  declined: { label: "Rechazado", className: "bg-destructive text-destructive-foreground border-transparent" },
  expired: { label: "Expirado", className: "bg-status-retired text-white border-transparent" },
  completed: { label: "Completado", className: "bg-status-available text-white border-transparent" },
  reported: { label: "Reportado", className: "bg-status-maintenance text-white border-transparent" },
  in_repair: { label: "En Reparación", className: "bg-status-maintenance text-white border-transparent" },
  repaired: { label: "Reparado", className: "bg-status-available text-white border-transparent" },
  invoiced: { label: "Facturado", className: "bg-status-rented text-white border-transparent" },
  good: { label: "Bueno", className: "bg-status-available text-white border-transparent" },
  minor_damage: { label: "Daño Menor", className: "bg-status-maintenance text-white border-transparent" },
  major_damage: { label: "Daño Mayor", className: "bg-destructive text-destructive-foreground border-transparent" },
  needs_repair: { label: "Necesita Reparación", className: "bg-destructive text-destructive-foreground border-transparent" },
  active: { label: "Activo", className: "bg-status-available text-white border-transparent" },
  inactive: { label: "Inactivo", className: "bg-status-retired text-white border-transparent" },
  signed: { label: "Firmado", className: "bg-status-available text-white border-transparent" },
  cancelled: { label: "Cancelado", className: "bg-destructive text-destructive-foreground border-transparent" },
  partial: { label: "Parcial", className: "bg-status-maintenance text-white border-transparent" },
  scheduled: { label: "Programado", className: "bg-status-rented text-white border-transparent" },
  pending: { label: "Pendiente", className: "bg-status-maintenance text-white border-transparent" },
  delivery: { label: "Entrega", className: "bg-status-rented text-white border-transparent" },
  pickup: { label: "Recolección", className: "bg-status-maintenance text-white border-transparent" },
};

export function StatusBadge({ status }: { status: string }) {
  const config = statusConfig[status] || {
    label: status.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
    className: "bg-muted text-muted-foreground border-transparent",
  };
  return <Badge className={cn(config.className)}>{config.label}</Badge>;
}
