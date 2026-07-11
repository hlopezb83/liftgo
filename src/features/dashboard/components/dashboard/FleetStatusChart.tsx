import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import { PieChart as PieChartIcon } from "@/components/icons";
import { ReportChartCard } from "@/components/domain/ReportChartCard";

interface PieDataItem {
  name: string;
  value: number;
  color: string;
}

interface FleetStatusChartProps {
  data: PieDataItem[];
}

export function FleetStatusChart({ data }: FleetStatusChartProps) {
  return (
    <ReportChartCard
      title="Estado de la Flota"
      icon={PieChartIcon}
      iconColor="text-info"
      iconBg="bg-info/10"
      footer={
        <div className="flex flex-wrap justify-center gap-x-4 gap-y-2">
          {data.map((d) => (
            <div key={d.name} className="flex items-center gap-1.5 text-xs">
              <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: d.color }} />
              <span className="truncate">{d.name} ({d.value})</span>
            </div>
          ))}
        </div>
      }
    >
      {data.length > 0 ? (
        <ResponsiveContainer width="100%" height={240}>
          <PieChart>
            <Pie data={data} cx="50%" cy="50%" innerRadius={60} outerRadius={90} dataKey="value" paddingAngle={4}>
              {data.map((entry, i) => <Cell key={i} fill={entry.color} />)}
            </Pie>
            <Tooltip />
          </PieChart>
        </ResponsiveContainer>
      ) : (
        <p className="text-muted-foreground text-sm text-center py-10">Sin datos aún</p>
      )}
    </ReportChartCard>
  );
}
