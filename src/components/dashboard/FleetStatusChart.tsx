import { memo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";

interface PieDataItem {
  name: string;
  value: number;
  color: string;
}

interface FleetStatusChartProps {
  data: PieDataItem[];
}

export const FleetStatusChart = memo(function FleetStatusChart({ data }: FleetStatusChartProps) {
  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Estado de la Flota</CardTitle></CardHeader>
      <CardContent>
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
        <div className="flex justify-center gap-4 mt-2">
          {data.map((d) => (
            <div key={d.name} className="flex items-center gap-1.5 text-xs">
              <div className="w-2.5 h-2.5 rounded-full" style={{ background: d.color }} />
              {d.name} ({d.value})
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
});
