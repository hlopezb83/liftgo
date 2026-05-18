import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/StatusBadge";
import { usePortalCustomer, usePortalBookings, usePortalInvoices } from "@/features/customers/hooks/customers/useCustomerPortal";
import { formatCurrency } from "@/lib/formatCurrency";
import { CalendarDays, Receipt, DollarSign } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDateDisplay, formatDateRange } from "@/lib/utils";

export default function PortalDashboard() {
  const { data: customer, isLoading: customerLoading } = usePortalCustomer();
  const { data: bookings, isLoading: bookingsLoading } = usePortalBookings();
  const { data: invoices, isLoading: invoicesLoading } = usePortalInvoices();

  const isLoading = customerLoading || bookingsLoading || invoicesLoading;

  if (isLoading) {
    return (
      <div className="space-y-6 max-w-5xl">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Skeleton className="h-40" />
          <Skeleton className="h-40" />
          <Skeleton className="h-40" />
        </div>
      </div>
    );
  }

  const activeBookings = bookings?.filter((b) => b.status === "confirmed") || [];
  const unpaidInvoices = invoices?.filter((i) => i.status !== "paid" && i.status !== "cancelled") || [];
  const outstanding = unpaidInvoices.reduce((sum, i) => sum + Number(i.total), 0);
  const recentInvoices = invoices?.slice(0, 5) || [];

  return (
    <div className="space-y-6 max-w-5xl">
      <h1 className="text-2xl font-bold">
        Bienvenido{customer?.name ? `, ${customer.name}` : ""}
      </h1>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Rentas Activas</CardTitle>
            <CalendarDays className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{activeBookings.length}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Saldo Pendiente</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className={`text-3xl font-bold font-mono ${outstanding > 0 ? "text-destructive" : ""}`}>
              {formatCurrency(outstanding)}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total de Facturas</CardTitle>
            <Receipt className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{invoices?.length || 0}</p>
          </CardContent>
        </Card>
      </div>

      {activeBookings.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Rentas Actuales</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {activeBookings.map((b) => (
              <div key={b.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/40 text-sm">
                <div>
                  <p className="font-medium">{b.forklifts?.name || "—"} — {b.forklifts?.model || ""}</p>
                  <p className="text-xs text-muted-foreground">{formatDateRange(b.start_date, b.end_date)}</p>
                </div>
                <StatusBadge status={b.status} />
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {recentInvoices.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Facturas Recientes</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {recentInvoices.map((inv) => (
              <div key={inv.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/40 text-sm">
                <div>
                  <p className="font-medium">{inv.invoice_number}</p>
                  <p className="text-xs text-muted-foreground">{formatDateDisplay(inv.issued_at)}</p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-mono font-semibold">{formatCurrency(Number(inv.total))}</span>
                  <StatusBadge status={inv.status} />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
