import { memo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { TrendingUp } from "lucide-react";

interface WeeklyUtilizationItem {
  week_label: string;
  utilization: number;
}

interface RevenueItem {
  name: string;
  revenue: number;
}

interface UtilizationChartsProps {
  weeklyUtilization: WeeklyUtilizationItem[];
  revenuePerUnit?: RevenueItem[];
}

export const UtilizationCharts = memo(function UtilizationCharts({ weeklyUtilization }: UtilizationChartsProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2"><TrendingUp className="h-4 w-4" /> Utilización de Flota (%)</CardTitle>
      </CardHeader>
      <CardContent>
        {weeklyUtilization.length > 0 ? (
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={weeklyUtilization} barSize={24}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
              <XAxis dataKey="week_label" tick={{ fontSize: 11 }} />
              <YAxis domain={[0, 100]} tick={{ fontSize: 12 }} tickFormatter={(v) => `${v}%`} />
              <Tooltip formatter={(v: number) => `${v}%`} />
              <Bar dataKey="utilization" fill="hsl(var(--status-rented))" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <p className="text-muted-foreground text-sm text-center py-10">Sin datos aún</p>
        )}
      </CardContent>
    </Card>
  );
});
