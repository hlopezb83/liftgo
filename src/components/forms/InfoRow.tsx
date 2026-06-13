import type { ReactNode } from "react";

interface InfoRowProps {
  label: ReactNode;
  value: ReactNode;
  emphasis?: boolean;
}

/**
 * Fila etiqueta / valor reutilizable en cards de detalle.
 * Compartida entre bookings, returns y deliveries.
 */
export function InfoRow({ label, value, emphasis = false }: InfoRowProps) {
  return (
    <div className="flex items-center justify-between">
      <span className={`text-sm ${emphasis ? "font-medium" : "text-muted-foreground"}`}>
        {label}
      </span>
      <span className={`text-sm ${emphasis ? "font-semibold text-primary" : "font-medium"}`}>
        {value}
      </span>
    </div>
  );
}
