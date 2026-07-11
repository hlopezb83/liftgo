import { type ElementType, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { ArrowRight } from "@/components/icons";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/**
 * KpiTile — Tarjeta KPI compacta con icono a la izquierda, label y valor.
 * Unifica los patrones de StatCards y FinancialKpiCards del dashboard.
 *
 * Coexiste con:
 *  - `StatCards` (recibe arreglo tipado) que ahora se implementa sobre KpiTile.
 *  - `ActivityKPIs` (layout distinto: icono arriba-derecha) que mantiene su forma.
 */
export interface KpiTileProps {
  label: string;
  /** String, número (se aplica `tabular-nums`) o nodo con formato propio. */
  value: ReactNode;
  icon?: ElementType;
  /** Token de color de texto para el icono. Ej: `"text-success"`. */
  iconColor?: string;
  /** Token de fondo tintado del contenedor del icono. Ej: `"bg-success/10"`. */
  iconBg?: string;
  /** Contenido secundario debajo del valor (badge, delta, etc.). */
  hint?: ReactNode;
  /** Si se provee, la tarjeta se renderiza como Link (navegación interna). */
  href?: string;
  /** Handler alternativo a href. */
  onClick?: () => void;
  /** Tamaño del valor. `sm` = texto compacto (default StatCards), `lg` = destacado. */
  valueSize?: "sm" | "lg";
  className?: string;
}

const BG_BY_COLOR: Record<string, string> = {
  "text-primary": "bg-primary/10",
  "text-status-available": "bg-status-available/10",
  "text-status-rented": "bg-status-rented/10",
  "text-status-maintenance": "bg-status-maintenance/10",
  "text-status-sold": "bg-status-sold/10",
  "text-success": "bg-success/10",
  "text-info": "bg-info/10",
  "text-warning": "bg-warning/10",
  "text-destructive": "bg-destructive/10",
  "text-chart-5": "bg-chart-5/10",
  "text-muted-foreground": "bg-muted",
};

function resolveValueClass(value: ReactNode, valueSize: "sm" | "lg"): string {
  if (valueSize === "lg") return "text-2xl font-bold tabular-nums";
  const isString = typeof value === "string";
  return cn(
    isString ? "text-sm sm:text-base" : "text-lg sm:text-2xl",
    "font-bold truncate tabular-nums",
  );
}

function KpiInteractiveWrapper({
  href,
  onClick,
  children,
}: {
  href?: string;
  onClick?: () => void;
  children: ReactNode;
}) {
  if (href) return <Link to={href} className="group">{children}</Link>;
  if (onClick) return <button type="button" onClick={onClick} className="group text-left w-full">{children}</button>;
  return <>{children}</>;
}

export function KpiTile({
  label,
  value,
  icon: Icon,
  iconColor = "text-primary",
  iconBg,
  hint,
  href,
  onClick,
  valueSize = "sm",
  className,
}: KpiTileProps) {
  const isPrimitive = typeof value === "string" || typeof value === "number";
  const isInteractive = Boolean(href || onClick);
  const bg = iconBg ?? BG_BY_COLOR[iconColor] ?? "bg-muted";
  const valueClass = resolveValueClass(value, valueSize);

  return (
    <KpiInteractiveWrapper href={href} onClick={onClick}>
      <Card
        className={cn(
          "hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200",
          isInteractive && "cursor-pointer group-hover:ring-2 group-hover:ring-primary/20",
          className,
        )}
      >
        <CardContent className="p-3 sm:p-4 flex items-center gap-2 sm:gap-3 overflow-hidden">
          {Icon ? (
            <div className={cn("p-2 sm:p-2.5 rounded-xl shrink-0", bg)}>
              <Icon className={cn("h-4 w-4 sm:h-5 sm:w-5", iconColor)} />
            </div>
          ) : null}
          <div className="min-w-0 flex-1">
            <p className="text-[10px] sm:text-xs text-muted-foreground leading-tight truncate" title={label}>
              {label}
            </p>
            <p className={valueClass} title={isPrimitive ? String(value) : undefined}>
              {value}
            </p>
            {hint ? <div className="mt-0.5">{hint}</div> : null}
          </div>
          {isInteractive ? (
            <ArrowRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0 hidden sm:block" />
          ) : null}
        </CardContent>
      </Card>
    </KpiInteractiveWrapper>
  );
}
