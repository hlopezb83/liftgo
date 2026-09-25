import type { ReactNode } from "react";

interface InfoRowProps {
  label: ReactNode;
  value: ReactNode;
  emphasis?: boolean;
}

/**
 * Fila etiqueta / valor reutilizable en cards de detalle.
 * Compartida entre fichas de reservas, entregas, devoluciones y cotizaciones.
 */
export function InfoRow({ label, value, emphasis = false }: InfoRowProps) {
  return (
    <div className="flex items-start justify-between gap-4">
      <span className={`shrink-0 text-sm ${emphasis ? "font-medium" : "text-muted-foreground"}`}>
        {label}
      </span>
      <span className={`min-w-0 max-w-[65%] break-words text-right text-sm ${emphasis ? "font-semibold text-primary" : "font-medium"}`}>
        {value}
      </span>
    </div>
  );
}
