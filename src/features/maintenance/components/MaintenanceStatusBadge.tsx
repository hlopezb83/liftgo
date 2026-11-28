import { Badge, type BadgeProps } from "@/components/ui/badge";

const STATUS_LABELS: Record<string, { label: string; variant: BadgeProps["variant"] }> = {
  pending: { label: "Pendiente", variant: "secondary" },
  in_progress: { label: "En Progreso", variant: "default" },
  waiting_parts: { label: "Esperando Refacciones", variant: "outline" },
  completed: { label: "Completado", variant: "secondary" },
  cancelled: { label: "Cancelado", variant: "secondary" },
};

interface Props {
  status: string;
  className?: string;
}

export function MaintenanceStatusBadge({ status, className }: Props) {
  const display = STATUS_LABELS[status];
  return (
    <Badge variant={display?.variant ?? "secondary"} className={className}>
      {display?.label ?? status}
    </Badge>
  );
}
