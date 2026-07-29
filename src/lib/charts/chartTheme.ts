/**
 * Oleada 3 (C-7): tema de gráficas unificado.
 * - Paleta desde tokens (`hsl(var(--chart-*))`, `--destructive`, `--muted-foreground`).
 * - `tickFormatter` compacto para ejes Y de dinero.
 * - Props canónicas para <CartesianGrid> y ticks pequeños.
 */
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
