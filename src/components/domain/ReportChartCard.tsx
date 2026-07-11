import { type ElementType, type ReactNode } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/**
 * ReportChartCard — Wrapper unificado para tarjetas de gráficas de dashboard/reportes.
 * Extrae el patrón repetido de CardHeader con icono tintado + CardContent con altura fija.
 * El caller sigue montando su `ResponsiveContainer` para conservar libertad sobre la gráfica.
 */
export interface ReportChartCardProps {
  title: ReactNode;
  icon?: ElementType;
  /** Token de color de texto del icono. Ej: `"text-primary"`. */
  iconColor?: string;
  /** Token de fondo tintado del contenedor del icono. Ej: `"bg-primary/10"`. */
  iconBg?: string;
  /** Contenido a la derecha del título (badge, botón). */
  action?: ReactNode;
  /** Nodo bajo el gráfico (leyenda, notas). */
  footer?: ReactNode;
  /** Padding del contenido. Por default `default` (px-6 py-4 del Card). */
  contentClassName?: string;
  className?: string;
  children: ReactNode;
}

export const ReportChartCard = memo(function ReportChartCard({
  title,
  icon: Icon,
  iconColor = "text-primary",
  iconBg = "bg-primary/10",
  action,
  footer,
  contentClassName,
  className,
  children,
}: ReportChartCardProps) {
  return (
    <Card className={className}>
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-base flex items-center gap-2">
            {Icon ? (
              <div className={cn("p-2 rounded-lg", iconBg)}>
                <Icon className={cn("h-4 w-4", iconColor)} />
              </div>
            ) : null}
            {title}
          </CardTitle>
          {action}
        </div>
      </CardHeader>
      <CardContent className={contentClassName}>
        {children}
        {footer ? <div className="mt-2">{footer}</div> : null}
      </CardContent>
    </Card>
  );
});
