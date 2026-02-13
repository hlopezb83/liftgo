import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useForklifts, useBookings } from "@/hooks/useForkliftData";
import { StatusBadge } from "@/components/StatusBadge";
import { PageHeader } from "@/components/PageHeader";
import { Truck, CheckCircle, Clock, Wrench } from "lucide-react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

const STATUS_COLORS = {
  available: "hsl(142, 71%, 45%)",
  rented: "hsl(217, 91%, 60%)",
  maintenance: "hsl(38, 92%, 50%)",
  retired: "hsl(220, 10%, 55%)",
};

export default function Dashboard() {
  const { data: forklifts, isLoading } = useForklifts();
  const { data: bookings } = useBookings();
  const navigate = useNavigate();

  const counts = {
    total: forklifts?.length || 0,
    available: forklifts?.filter((f) => f.status === "available").length || 0,
    rented: forklifts?.filter((f) => f.status === "rented").length || 0,
    maintenance: forklifts?.filter((f) => f.status === "maintenance").length || 0,
  };

  const pieData = [
    { name: "Available", value: counts.available, color: STATUS_COLORS.available },
    { name: "Rented", value: counts.rented, color: STATUS_COLORS.rented },
    { name: "Maintenance", value: counts.maintenance, color: STATUS_COLORS.maintenance },
  ].filter((d) => d.value > 0);

  const statCards = [
    { label: "Total Fleet", value: counts.total, icon: Truck, color: "text-primary" },
    { label: "Available", value: counts.available, icon: CheckCircle, color: "text-status-available" },
    { label: "Rented", value: counts.rented, icon: Clock, color: "text-status-rented" },
    { label: "In Maintenance", value: counts.maintenance, icon: Wrench, color: "text-status-maintenance" },
  ];

  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-28 rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Dashboard"
        subtitle="Fleet overview at a glance"
        action={<Button onClick={() => navigate("/fleet/new")} size="sm">Add Forklift</Button>}
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((card) => (
          <Card key={card.label} className="hover:shadow-md transition-shadow">
            <CardContent className="p-5 flex items-center gap-4">
              <div className={`p-2.5 rounded-xl bg-muted ${card.color}`}>
                <card.icon className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">{card.label}</p>
                <p className="text-2xl font-bold">{card.value}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Fleet Status</CardTitle>
          </CardHeader>
          <CardContent>
            {pieData.length > 0 ? (
              <ResponsiveContainer width="100%" height={240}>
                <PieChart>
                  <Pie data={pieData} cx="50%" cy="50%" innerRadius={60} outerRadius={90} dataKey="value" paddingAngle={4}>
                    {pieData.map((entry, i) => (
                      <Cell key={i} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-muted-foreground text-sm text-center py-10">No data yet</p>
            )}
            <div className="flex justify-center gap-4 mt-2">
              {pieData.map((d) => (
                <div key={d.name} className="flex items-center gap-1.5 text-xs">
                  <div className="w-2.5 h-2.5 rounded-full" style={{ background: d.color }} />
                  {d.name} ({d.value})
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Active Bookings</CardTitle>
          </CardHeader>
          <CardContent>
            {bookings && bookings.length > 0 ? (
              <div className="space-y-3">
                {bookings.slice(0, 5).map((b: any) => (
                  <div key={b.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                    <div>
                      <p className="font-medium text-sm">{b.forklifts?.name} — {b.forklifts?.model}</p>
                      <p className="text-xs text-muted-foreground">{b.customer_name}</p>
                    </div>
                    <div className="text-right text-xs text-muted-foreground">
                      {b.start_date} → {b.end_date}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-muted-foreground text-sm text-center py-10">No bookings yet</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
