import { BarChart, Bar, CartesianGrid, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { chartGridProps } from "@/lib/charts/chartTheme";
import { truncateAxisLabel, useChartSizing } from "@/lib/charts/useChartSizing";
import { getUtilColor, type ModelRow } from "./utilizationHelpers";

export function UtilizationChart({ chartData }: { chartData: ModelRow[] }) {
  const { tick, categoryAxisWidth, isMobile } = useChartSizing();
  return (
    <div className="h-72">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={chartData} layout="vertical" margin={{ left: isMobile ? 0 : 20, right: isMobile ? 8 : 0 }}>
          <CartesianGrid {...chartGridProps} vertical horizontal={false} />
          <XAxis type="number" unit="%" domain={[0, 100]} tick={tick} />
          <YAxis
            type="category"
            dataKey="model"
            width={categoryAxisWidth}
            tick={tick}
            tickFormatter={(v: string) => (isMobile ? truncateAxisLabel(v, 14) : v)}
          />
          <Tooltip
            formatter={(val) => `${Number(val)}%`}
            cursor={{ className: "fill-muted/40" }}
            contentStyle={{
              background: "hsl(var(--popover))",
              color: "hsl(var(--popover-foreground))",
              border: "1px solid hsl(var(--border))",
              borderRadius: "var(--radius)",
              boxShadow: "0 4px 12px hsl(var(--foreground) / 0.08)",
              fontSize: 12,
            }}
            labelStyle={{ color: "hsl(var(--foreground))", fontWeight: 500 }}
          />
          <Bar dataKey="utilization" radius={[0, 4, 4, 0]}>
            {chartData.map((entry) => (
              <Cell key={entry.model} fill={getUtilColor(entry.utilization)} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
