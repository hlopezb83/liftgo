
import { ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { ReportChartCard } from "@/components/domain/ReportChartCard";
import { TrendingUpIcon, TrendingDownIcon, RemoveIcon } from "@/components/icons";

interface MonthlyUtilizationItem {
  month_label: string;
  utilization: number;
}

interface RevenueItem {
  name: string;
  revenue: number;
}

interface UtilizationChartsProps {
  monthlyUtilization: MonthlyUtilizationItem[];
  revenuePerUnit?: RevenueItem[];
}

interface TrendPoint extends MonthlyUtilizationItem {
  trend: number;
}

function computeTrend(data: MonthlyUtilizationItem[]): { points: TrendPoint[]; delta: number } {
  const n = data.length;
  if (n < 2) return { points: data.map((d) => ({ ...d, trend: d.utilization })), delta: 0 };
  const xs = data.map((_, i) => i);
  const ys = data.map((d) => d.utilization);
  const meanX = xs.reduce((a, b) => a + b, 0) / n;
  const meanY = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (xs[i] - meanX) * (ys[i] - meanY);
    den += (xs[i] - meanX) ** 2;
  }
  const slope = den === 0 ? 0 : num / den;
  const intercept = meanY - slope * meanX;
  const points = data.map((d, i) => ({
    ...d,
    trend: Math.max(0, Math.min(100, Math.round(slope * i + intercept))),
  }));
  const delta = points[n - 1].trend - points[0].trend;
  return { points, delta };
}

export function UtilizationCharts({ monthlyUtilization }: UtilizationChartsProps) {
  const { points, delta } = computeTrend(monthlyUtilization);
  const trendLabel = delta > 1
    ? { icon: TrendingUpIcon, text: `Subiendo ${Math.abs(delta)}%`, cls: "text-status-available" }
    : delta < -1
    ? { icon: TrendingDownIcon, text: `Bajando ${Math.abs(delta)}%`, cls: "text-destructive" }
    : { icon: RemoveIcon, text: "Estable", cls: "text-muted-foreground" };
  const TrendIcon = trendLabel.icon;

  return (
    <ReportChartCard
      title="Utilización de Flota — Últimos 6 meses (%)"
      icon={TrendingUpIcon}
      iconColor="text-primary"
      iconBg="bg-primary/10"
      action={
        monthlyUtilization.length >= 2 ? (
          <div className={`flex items-center gap-1.5 text-xs font-medium ${trendLabel.cls}`}>
            <TrendIcon className="h-3.5 w-3.5" />
            <span>Tendencia: {trendLabel.text}</span>
          </div>
        ) : null
      }
    >
      {points.length > 0 ? (
        <ResponsiveContainer width="100%" height={220}>
          <ComposedChart data={points} barSize={24}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
            <XAxis dataKey="month_label" tick={{ fontSize: 11 }} />
            <YAxis domain={[0, 100]} tick={{ fontSize: 12 }} tickFormatter={(v) => `${v}%`} />
            <Tooltip formatter={(v) => `${Number(v)}%`} />
            <Bar dataKey="utilization" name="Utilización" fill="hsl(var(--status-rented))" radius={[4, 4, 0, 0]} />
            <Line type="monotone" dataKey="trend" name="Tendencia" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
          </ComposedChart>
        </ResponsiveContainer>
      ) : (
        <p className="text-muted-foreground text-sm text-center py-10">Sin datos aún</p>
      )}
    </ReportChartCard>
  );
}
