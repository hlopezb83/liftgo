import { type ElementType, type ReactNode } from "react";
import { ArrowRight } from "@/components/icons";
import { Card, CardContent } from "@/components/ui/card";
import { Link } from "@/lib/router-compat-ui";
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

/**
 * V05: la escala depende de `valueSize` y de la LONGITUD del valor, no de si
 * llegó como string o number — `123` y `"123"` deben verse igual. Se mide con
 * `String(value)` solo para contar caracteres; el render conserva el valor
 * original (signos, decimales y moneda intactos). Un ReactNode no se convierte
 * a string: recibe el tamaño base de su escala. Nunca se baja de `text-sm`.
 */
function resolveValueClass(value: ReactNode, valueSize: "sm" | "lg"): string {
  const isPrimitive = typeof value === "string" || typeof value === "number";
  const length = isPrimitive ? String(value).length : 0;
  let size: string;
  if (valueSize === "lg") {
    if (!isPrimitive || length <= 10) size = "text-2xl";
    else if (length <= 12) size = "text-xl";
    else if (length <= 14) size = "text-lg";
    else size = "text-base";
  } else {
    if (!isPrimitive || length <= 10) size = "text-lg";
    else if (length <= 12) size = "text-base";
    else size = "text-sm";
  }
  return cn(size, "font-bold tabular-nums");
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
  // V26-06: `h-full` en el enlace/botón para que la tarjeta ocupe toda la
  // celda del grid y todas las tarjetas de una fila midan lo mismo.
  if (href) return <Link to={href} className="group block h-full">{children}</Link>;
  if (onClick) return <button type="button" onClick={onClick} className="group text-left w-full h-full">{children}</button>;
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
          "h-full hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200",
          isInteractive && "cursor-pointer group-hover:ring-2 group-hover:ring-primary/20",
          className,
        )}
      >
        {/* V26-06: contenido alineado arriba para que título y valor queden a
            la misma altura entre tarjetas con etiquetas de 1 y 2 líneas. */}
        <CardContent className="p-4 h-full flex items-start gap-2 sm:gap-3">
          {Icon ? (
            <div className={cn("p-2 sm:p-2.5 rounded-xl shrink-0", bg)}>
              <Icon className={cn("h-4 w-4 sm:h-5 sm:w-5", iconColor)} />
            </div>
          ) : null}
          <div className="min-w-0 flex-1">
            {/* Las etiquetas largas se muestran completas, sin límite de
                líneas, con ruptura de emergencia y title íntegro. */}
            {/* V26-06: se reserva la altura de 2 líneas (2 × leading-tight)
                para que el valor arranque a la misma altura en todas las
                tarjetas, sin truncar ni ocultar títulos largos. */}
            <p className="text-3xs sm:text-xs text-muted-foreground leading-tight [overflow-wrap:anywhere] min-h-[2.5em]" title={label}>
              {label}
            </p>
            {/* V05: ruptura de emergencia para que importes largos nunca se
                recorten; el texto original (signo, moneda, decimales) se
                conserva íntegro, sin ellipsis. */}
            <p className={cn(valueClass, "[overflow-wrap:anywhere]")} title={isPrimitive ? String(value) : undefined}>
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
