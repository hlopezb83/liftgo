import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { TrendingUp, Receipt } from "lucide-react";

interface UtilizationItem {
  name: string;
  utilization: number;
}

interface RevenueItem {
  name: string;
  revenue: number;
}

interface UtilizationChartsProps {
  utilizationData: UtilizationItem[];
  revenuePerUnit: RevenueItem[];
}

export function UtilizationCharts({ utilizationData, revenuePerUnit }: UtilizationChartsProps) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2"><TrendingUp className="h-4 w-4" /> Fleet Utilization (%)</CardTitle>
        </CardHeader>
        <CardContent>
          {utilizationData.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={utilizationData} layout="vertical" barSize={16}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 12 }} tickFormatter={(v) => `${v}%`} />
                <YAxis type="category" dataKey="name" width={70} tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v: number) => `${v}%`} />
                <Bar dataKey="utilization" fill="hsl(217, 91%, 60%)" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-muted-foreground text-sm text-center py-10">No data yet</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2"><Receipt className="h-4 w-4" /> Revenue per Unit</CardTitle>
        </CardHeader>
        <CardContent>
          {revenuePerUnit.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={revenuePerUnit} layout="vertical" barSize={16}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis type="number" tick={{ fontSize: 12 }} tickFormatter={(v) => `€${v}`} />
                <YAxis type="category" dataKey="name" width={70} tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v: number) => `€${v.toFixed(2)}`} />
                <Bar dataKey="revenue" fill="hsl(142, 71%, 45%)" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-muted-foreground text-sm text-center py-10">No paid invoices linked to bookings</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
