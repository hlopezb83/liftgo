import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Cell } from "recharts";
import { EmptyState } from "@/components/feedback/EmptyState";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { chartGridProps, chartTick, formatCompactMxn } from "@/lib/charts/chartTheme";
import { formatCurrency } from "@/lib/format/formatCurrency";
import type { ModelRow } from "../../../hooks/useProfitByModelReport";

const chartConfig = { profit: { label: "Ganancia Neta" } };

export function ProfitabilityChart({ chartRows }: { chartRows: ModelRow[] }) {
  if (chartRows.length === 0) {
    return <EmptyState title="Sin datos" subtitle="No hay datos para el rango seleccionado." />;
  }
  return (
    <ChartContainer config={chartConfig} className="h-[400px] w-full">
      <BarChart data={chartRows} layout="vertical" margin={{ left: 20, right: 20 }}>
        <CartesianGrid {...chartGridProps} />
        <XAxis type="number" tick={chartTick} tickFormatter={(v: number) => formatCompactMxn(v)} />
        <YAxis type="category" dataKey="model" width={160} tick={chartTick} />
        <ChartTooltip content={<ChartTooltipContent />} formatter={(value) => formatCurrency(Number(value))} />
        <Bar dataKey="profit" name="Ganancia Neta" radius={[0, 4, 4, 0]}>
          {chartRows.map((r, i) => (
            <Cell key={i} fill={r.profit >= 0 ? "hsl(var(--chart-2))" : "hsl(var(--destructive))"} />
          ))}
        </Bar>
      </BarChart>
    </ChartContainer>
  );
}
