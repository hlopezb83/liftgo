import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import { ReportChartCard } from "@/components/domain/ReportChartCard";
import { PieChart as PieChartIcon } from "@/components/icons";

interface PieDataItem {
  name: string;
  value: number;
  color: string;
}

interface FleetStatusChartProps {
  data: PieDataItem[];
}

export function FleetStatusChart({ data }: FleetStatusChartProps) {
  const total = data.reduce((s, d) => s + (Number(d.value) || 0), 0);

  return (
    <ReportChartCard
      title="Estado de la Flota"
      icon={PieChartIcon}
      iconColor="text-info"
      iconBg="bg-info/10"
    >
      {data.length > 0 ? (
        <div className="flex flex-col md:flex-row md:items-center gap-4">
          <div className="relative flex-1 min-w-0">
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie
                  data={data}
                  cx="50%"
                  cy="50%"
                  innerRadius={64}
                  outerRadius={92}
                  dataKey="value"
                  paddingAngle={4}
                  stroke="none"
                >
                  {data.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-2xl font-bold font-mono leading-none">{total}</span>
              <span className="text-2xs text-muted-foreground uppercase tracking-wider mt-1">Equipos</span>
            </div>
          </div>
          <ul className="flex md:flex-col flex-wrap justify-center md:justify-start gap-x-4 gap-y-2 md:min-w-[140px]">
            {data.map((d) => {
              const pct = total > 0 ? Math.round((d.value / total) * 100) : 0;
              return (
                <li key={d.name} className="flex items-center gap-2 text-xs">
                  <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: d.color }} />
                  <span className="text-muted-foreground">{d.name}</span>
                  <span className="font-mono font-medium ml-auto">{d.value}</span>
                  <span className="text-2xs text-muted-foreground tabular-nums">{pct}%</span>
                </li>
              );
            })}
          </ul>
        </div>
      ) : (
        <p className="text-muted-foreground text-sm text-center py-10">Sin datos aún</p>
      )}
    </ReportChartCard>
  );
}
