/**
 * Oleada 3 (C-7): tema de gráficas unificado.
 * - Paleta desde tokens (`hsl(var(--chart-*))`, `--destructive`, `--muted-foreground`).
 * - `tickFormatter` compacto para ejes Y de dinero.
 * - `tooltipFormatter` con `formatCurrency` es-MX.
 * - Props canónicas para <CartesianGrid> y ticks pequeños.
 */
import { formatCurrency } from "@/lib/format/formatCurrency";

// Máximo 4 series activas — resto queda como fallback.
export const CHART_COLORS = {
  primary: "hsl(var(--chart-1))",
  secondary: "hsl(var(--chart-2))",
  tertiary: "hsl(var(--chart-3))",
  quaternary: "hsl(var(--chart-4))",
  negative: "hsl(var(--destructive))",
  muted: "hsl(var(--muted-foreground))",
} as const;

const COMPACT_MXN = new Intl.NumberFormat("es-MX", {
  style: "currency",
  currency: "MXN",
  notation: "compact",
  maximumFractionDigits: 1,
});

export function formatCompactMxn(n: number | string): string {
  const v = typeof n === "string" ? Number(n) : n;
  return Number.isFinite(v) ? COMPACT_MXN.format(v) : "";
}

export const chartTick = { fontSize: 11 } as const;

export const chartGridProps = {
  strokeDasharray: "3 3",
  className: "stroke-border",
  vertical: false,
} as const;

export function tooltipCurrencyFormatter(val: number | string): string {
  return formatCurrency(Number(val));
}

/** Altura mínima uniforme para gráficas en cards de dashboard/reportes. */
export const CHART_MIN_HEIGHT_CLASS = "h-64";
