import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

/**
 * Escala canónica de tamaños de ícono (px). Prohibido `h-N w-N` ad-hoc.
 *   xs → 12  (indicadores compactos)
 *   sm → 16  (default, botones y filas)
 *   md → 20  (headers, toolbars)
 *   lg → 24  (empty states, hero secundario)
 *   xl → 32  (empty states principales)
 */
export type IconSize = "xs" | "sm" | "md" | "lg" | "xl";

const SIZE_CLASS: Record<IconSize, string> = {
  xs: "h-3 w-3",
  sm: "h-4 w-4",
  md: "h-5 w-5",
  lg: "h-6 w-6",
  xl: "h-8 w-8",
};

type IconProps = {
  as: LucideIcon;
  size?: IconSize;
  className?: string;
  strokeWidth?: number;
  "aria-hidden"?: boolean;
  "aria-label"?: string;
};

/**
 * Wrapper unificado. Uso:
 *   <Icon as={DeleteIcon} size="sm" />
 *   <Icon as={SpinnerIcon} size="md" className="animate-spin" />
 *
 * Estética "industrial minimalist premium": strokeWidth 1.75 por default.
 */
export function Icon({
  as: Component,
  size = "sm",
  className,
  strokeWidth = 1.75,
  ...rest
}: IconProps) {
  return (
    <Component
      className={cn(SIZE_CLASS[size], className)}
      strokeWidth={strokeWidth}
      aria-hidden={rest["aria-hidden"] ?? true}
      aria-label={rest["aria-label"]}
    />
  );
}
