import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useForklifts, useBookings, useInvoices } from "@/hooks/useForkliftData";
import { StatusBadge } from "@/components/StatusBadge";
import { PageHeader } from "@/components/PageHeader";
import { Truck, CheckCircle, Clock, Wrench, Receipt } from "lucide-react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, BarChart, Bar, XAxis, YAxis, CartesianGrid } from "recharts";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { format, parseISO, startOfMonth } from "date-fns";
import { useMemo } from "react";

const STATUS_COLORS = {
  available: "hsl(142, 71%, 45%)",
  rented: "hsl(217, 91%, 60%)",
  maintenance: "hsl(38, 92%, 50%)",
  retired: "hsl(220, 10%, 55%)",
};

const INVOICE_STATUS_COLORS = {
  draft: "hsl(220, 10%, 55%)",
  sent: "hsl(217, 91%, 60%)",
  overdue: "hsl(0, 84%, 60%)",
  paid: "hsl(142, 71%, 45%)",
};

export default function Dashboard() {
  const { data: forklifts, isLoading } = useForklifts();
  const { data: bookings } = useBookings();
  const { data: invoices } = useInvoices();
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

  const outstandingRevenue = invoices?.filter((i) => i.status !== "paid").reduce((sum, i) => sum + Number(i.total), 0) || 0;

  // Invoice breakdown by status
  const invoiceBreakdown = useMemo(() => {
    if (!invoices) return [];
    const groups: Record<string, { count: number; total: number }> = {};
    invoices.forEach((inv) => {
      if (!groups[inv.status]) groups[inv.status] = { count: 0, total: 0 };
      groups[inv.status].count++;
      groups[inv.status].total += Number(inv.total);
    });
    return Object.entries(groups).map(([status, data]) => ({
      status,
      ...data,
      color: INVOICE_STATUS_COLORS[status as keyof typeof INVOICE_STATUS_COLORS] || "hsl(220, 10%, 55%)",
    }));
  }, [invoices]);

  // Cash flow by month (invoices issued vs paid)
  const cashFlowData = useMemo(() => {
    if (!invoices || invoices.length === 0) return [];
    const months: Record<string, { month: string; invoiced: number; paid: number }> = {};

    invoices.forEach((inv) => {
      const monthKey = format(startOfMonth(parseISO(inv.issued_at)), "yyyy-MM");
      const monthLabel = format(startOfMonth(parseISO(inv.issued_at)), "MMM yyyy");
      if (!months[monthKey]) months[monthKey] = { month: monthLabel, invoiced: 0, paid: 0 };
      months[monthKey].invoiced += Number(inv.total);
    });

    invoices.filter((inv) => inv.paid_at).forEach((inv) => {
      const monthKey = format(startOfMonth(parseISO(inv.paid_at!)), "yyyy-MM");
      const monthLabel = format(startOfMonth(parseISO(inv.paid_at!)), "MMM yyyy");
      if (!months[monthKey]) months[monthKey] = { month: monthLabel, invoiced: 0, paid: 0 };
      months[monthKey].paid += Number(inv.total);
    });

    return Object.entries(months)
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-6)
      .map(([, data]) => data);
  }, [invoices]);

  const statCards = [
    { label: "Total Fleet", value: counts.total, icon: Truck, color: "text-primary" },
    { label: "Available", value: counts.available, icon: CheckCircle, color: "text-status-available" },
    { label: "Rented", value: counts.rented, icon: Clock, color: "text-status-rented" },
    { label: "In Maintenance", value: counts.maintenance, icon: Wrench, color: "text-status-maintenance" },
    { label: "Outstanding", value: `€${outstandingRevenue.toFixed(0)}`, icon: Receipt, color: "text-primary" },
  ];

  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          {[1, 2, 3, 4, 5].map((i) => (
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

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
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

        {/* Outstanding Invoices Breakdown */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Outstanding Invoices</CardTitle>
              <Button variant="outline" size="sm" onClick={() => navigate("/invoices")}>View All</Button>
            </div>
          </CardHeader>
          <CardContent>
            {invoiceBreakdown.length > 0 ? (
              <div className="space-y-3">
                {invoiceBreakdown.map((group) => (
                  <div key={group.status} className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                    <div className="flex items-center gap-3">
                      <div className="w-2.5 h-2.5 rounded-full" style={{ background: group.color }} />
                      <div>
                        <p className="font-medium text-sm capitalize">{group.status}</p>
                        <p className="text-xs text-muted-foreground">{group.count} invoice{group.count !== 1 ? "s" : ""}</p>
                      </div>
                    </div>
                    <p className="font-mono font-semibold text-sm">€{group.total.toFixed(2)}</p>
                  </div>
                ))}
                <div className="flex items-center justify-between pt-2 border-t">
                  <p className="text-sm font-medium">Total Outstanding</p>
                  <p className="font-mono font-bold">€{outstandingRevenue.toFixed(2)}</p>
                </div>
              </div>
            ) : (
              <p className="text-muted-foreground text-sm text-center py-10">No invoices yet</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Cash Flow Chart */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Cash Flow</CardTitle>
        </CardHeader>
        <CardContent>
          {cashFlowData.length > 0 ? (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={cashFlowData} barGap={4}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="month" tick={{ fontSize: 12 }} className="text-muted-foreground" />
                <YAxis tick={{ fontSize: 12 }} className="text-muted-foreground" tickFormatter={(v) => `€${v}`} />
                <Tooltip
                  formatter={(value: number) => `€${value.toFixed(2)}`}
                  contentStyle={{ borderRadius: "0.5rem", border: "1px solid hsl(var(--border))", background: "hsl(var(--card))" }}
                />
                <Bar dataKey="invoiced" name="Invoiced" fill="hsl(217, 91%, 60%)" radius={[4, 4, 0, 0]} />
                <Bar dataKey="paid" name="Paid" fill="hsl(142, 71%, 45%)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-muted-foreground text-sm text-center py-10">No invoice data yet</p>
          )}
          <div className="flex justify-center gap-6 mt-2">
            <div className="flex items-center gap-1.5 text-xs">
              <div className="w-2.5 h-2.5 rounded-full" style={{ background: "hsl(217, 91%, 60%)" }} />
              Invoiced
            </div>
            <div className="flex items-center gap-1.5 text-xs">
              <div className="w-2.5 h-2.5 rounded-full" style={{ background: "hsl(142, 71%, 45%)" }} />
              Paid
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Active Bookings */}
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
  );
}