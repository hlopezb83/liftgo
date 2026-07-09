import type { ElementType, ReactNode } from "react";

interface DetailRowProps {
  icon: ElementType;
  label: string;
  value: ReactNode;
}

/**
 * Fila icono + etiqueta apilada + valor usada en los sheets de detalle
 * (damage, inventory, crm, maintenance). Sustituye 4 copias idénticas locales.
 *
 * Nota: distinto de `InfoRow` (layout horizontal justificado sin icono),
 * que se usa en cards de bookings/deliveries/returns.
 */
export function DetailRow({ icon: Icon, label, value }: DetailRowProps) {
  return (
    <div className="flex items-start gap-3 py-2">
      <Icon className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-sm font-medium">{value || "—"}</p>
      </div>
    </div>
  );
}
