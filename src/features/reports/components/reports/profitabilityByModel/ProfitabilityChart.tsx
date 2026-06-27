import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Cell } from "recharts";
import { formatCurrency } from "@/lib/format/formatCurrency";
import type { ModelRow } from "./profitabilityHelpers";

const chartConfig = { profit: { label: "Ganancia Neta" } };

export function ProfitabilityChart({ chartRows }: { chartRows: ModelRow[] }) {
  if (chartRows.length === 0) {
    return <p className="text-muted-foreground text-center py-8">No hay datos para el rango seleccionado.</p>;
  }
  return (
    <ChartContainer config={chartConfig} className="h-[400px] w-full">
      <BarChart data={chartRows} layout="vertical" margin={{ left: 20, right: 20 }}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis type="number" tickFormatter={(v: number) => formatCurrency(v)} />
        <YAxis type="category" dataKey="model" width={160} tick={{ fontSize: 12 }} />
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
