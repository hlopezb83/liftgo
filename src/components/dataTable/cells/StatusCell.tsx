import { StatusBadge } from "@/components/feedback/StatusBadge";

interface StatusCellProps {
  status: string | null | undefined;
  /** Override opcional del label si el dominio requiere texto distinto al mapeo global. */
  label?: string;
}

/**
 * Wrapper delgado sobre StatusBadge para uso en columnas de tabla.
 * Centraliza el patrón "estado en celda" y permite extender comportamiento
 * (tooltip, indicador de stale, etc.) en un solo lugar.
 */
export function StatusCell({ status, label }: StatusCellProps) {
  if (!status) return <span className="text-muted-foreground">—</span>;
  return <StatusBadge status={status} label={label} />;
}
