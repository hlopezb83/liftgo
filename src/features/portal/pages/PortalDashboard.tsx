import { usePortalCustomer, usePortalBookings, usePortalInvoices } from "@/features/customers";
import { formatCurrency } from "@/lib/format/formatCurrency";
import { CalendarDays, Receipt, DollarSign } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { PortalStatCard } from "../components/PortalStatCard";
import { PortalBookingsCard, PortalRecentInvoicesCard } from "../components/PortalSections";
import { PageContainer } from "@/components/layout/PageContainer";
import { PageHeader } from "@/components/layout/PageHeader";

function PortalDashboardSkeleton() {
  return (
    <PageContainer maxWidth="wide">
      <Skeleton className="h-8 w-48" />
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Skeleton className="h-40" />
        <Skeleton className="h-40" />
        <Skeleton className="h-40" />
      </div>
    </PageContainer>
  );
}

export default function PortalDashboard() {
  const { data: customer, isLoading: customerLoading } = usePortalCustomer();
  const { data: bookings, isLoading: bookingsLoading } = usePortalBookings();
  const { data: invoices, isLoading: invoicesLoading } = usePortalInvoices();

  const isLoading = customerLoading || bookingsLoading || invoicesLoading;
  if (isLoading) return <PortalDashboardSkeleton />;

  const bookingList = bookings ?? [];
  const invoiceList = invoices ?? [];
  const activeBookings = bookingList.filter((b) => b.status === "confirmed");
  const unpaidInvoices = invoiceList.filter((i) => i.status !== "paid" && i.status !== "cancelled");
  const outstanding = unpaidInvoices.reduce((sum, i) => sum + Number(i.total), 0);
  const recentInvoices = invoiceList.slice(0, 5);
  const welcome = customer?.name ? `Bienvenido, ${customer.name}` : "Bienvenido";
  const balanceClass = `font-mono ${outstanding > 0 ? "text-destructive" : ""}`;

  return (
    <PageContainer maxWidth="wide">
      <PageHeader title={welcome} />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <PortalStatCard
          title="Rentas Activas"
          value={activeBookings.length}
          icon={<CalendarDays className="h-4 w-4 text-muted-foreground" />}
        />
        <PortalStatCard
          title="Saldo Pendiente"
          value={formatCurrency(outstanding)}
          icon={<DollarSign className="h-4 w-4 text-muted-foreground" />}
          valueClassName={balanceClass}
        />
        <PortalStatCard
          title="Total de Facturas"
          value={invoiceList.length}
          icon={<Receipt className="h-4 w-4 text-muted-foreground" />}
        />
      </div>

      {activeBookings.length > 0 && <PortalBookingsCard bookings={activeBookings} />}
      {recentInvoices.length > 0 && <PortalRecentInvoicesCard invoices={recentInvoices} />}
    </PageContainer>
  );
}
