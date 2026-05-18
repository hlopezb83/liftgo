import { usePortalCustomer, usePortalBookings, usePortalInvoices } from "@/features/customers/hooks/customers/useCustomerPortal";
import { formatCurrency } from "@/lib/formatCurrency";
import { CalendarDays, Receipt, DollarSign } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { PortalStatCard } from "../components/PortalStatCard";
import { PortalBookingsCard, PortalRecentInvoicesCard } from "../components/PortalSections";

export default function PortalDashboard() {
  const { data: customer, isLoading: customerLoading } = usePortalCustomer();
  const { data: bookings, isLoading: bookingsLoading } = usePortalBookings();
  const { data: invoices, isLoading: invoicesLoading } = usePortalInvoices();

  if (customerLoading || bookingsLoading || invoicesLoading) {
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

  const activeBookings = bookings?.filter((b) => b.status === "confirmed") ?? [];
  const unpaidInvoices = invoices?.filter((i) => i.status !== "paid" && i.status !== "cancelled") ?? [];
  const outstanding = unpaidInvoices.reduce((sum, i) => sum + Number(i.total), 0);
  const recentInvoices = invoices?.slice(0, 5) ?? [];

  return (
    <div className="space-y-6 max-w-5xl">
      <h1 className="text-2xl font-bold">
        Bienvenido{customer?.name ? `, ${customer.name}` : ""}
      </h1>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <PortalStatCard
          title="Rentas Activas"
          value={activeBookings.length}
          icon={<CalendarDays className="h-4 w-4 text-muted-foreground" />}
        />
        <PortalStatCard
          title="Saldo Pendiente"
          value={formatCurrency(outstanding)}
          icon={<DollarSign className="h-4 w-4 text-muted-foreground" />}
          valueClassName={`font-mono ${outstanding > 0 ? "text-destructive" : ""}`}
        />
        <PortalStatCard
          title="Total de Facturas"
          value={invoices?.length || 0}
          icon={<Receipt className="h-4 w-4 text-muted-foreground" />}
        />
      </div>

      {activeBookings.length > 0 && <PortalBookingsCard bookings={activeBookings} />}
      {recentInvoices.length > 0 && <PortalRecentInvoicesCard invoices={recentInvoices} />}
    </div>
  );
}
