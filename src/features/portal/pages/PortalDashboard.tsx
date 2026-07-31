import { KpiTile } from "@/components/domain/KpiTile";
import { QueryErrorState } from "@/components/feedback/QueryErrorState";
import { CalendarDays, InvoiceIcon, ExpenseIcon } from "@/components/icons";
import { PageContainer } from "@/components/layout/PageContainer";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { usePortalCustomer, usePortalBookings, usePortalInvoices } from "@/features/customers";
import { formatCompactCurrency, kpiSizeClass } from "@/lib/format/formatCurrency";
import { PortalBookingsCard, PortalRecentInvoicesCard } from "../components/PortalSections";
import { PortalUpcomingDues } from "../components/PortalUpcomingDues";

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
  const { data: customer, isLoading: customerLoading, isError: customerError, refetch: refetchCustomer } = usePortalCustomer();
  const { data: bookings, isLoading: bookingsLoading, isError: bookingsError, refetch: refetchBookings } = usePortalBookings();
  const { data: invoices, isLoading: invoicesLoading, isError: invoicesError, refetch: refetchInvoices } = usePortalInvoices();

  const isLoading = customerLoading || bookingsLoading || invoicesLoading;
  if (isLoading) return <PortalDashboardSkeleton />;

  // A-01: NUNCA renderizar KPIs en 0 ni "sin datos" cuando una query falló —
  // el cliente externo podría ver un saldo $0 falso durante un outage.
  const isError = customerError || bookingsError || invoicesError;
  if (isError) {
    return (
      <PageContainer maxWidth="wide">
        <QueryErrorState
          entity="tu información de cuenta"
          onRetry={() => {
            void refetchCustomer();
            void refetchBookings();
            void refetchInvoices();
          }}
        />
      </PageContainer>
    );
  }

  const bookingList = bookings ?? [];
  const invoiceList = invoices ?? [];
  const activeBookings = bookingList.filter((b) => b.status === "confirmed");
  const unpaidInvoices = invoiceList.filter((i) => i.status !== "paid" && i.status !== "cancelled");
  // R12 A3: saldo real MXN — usar `balance` (no `total`) y multiplicar por
  // `tipo_cambio` para normalizar facturas en USD. El RPC `get_portal_invoices`
  // ya devuelve ambos campos desde el fix R6.
  const outstanding = unpaidInvoices.reduce(
    (sum, i) => sum + Number((i as { balance?: number | string | null }).balance ?? 0) * Number((i as { tipo_cambio?: number | string | null }).tipo_cambio ?? 1),
    0,
  );
  const recentInvoices = invoiceList.slice(0, 5);
  const welcome = customer?.name ? `Bienvenido, ${customer.name}` : "Bienvenido";
  // Oleada 3 (C-3/C-2): formato compacto + escala tipográfica para no truncar el saldo.
  const outstandingLabel = formatCompactCurrency(outstanding);
  const balanceClass = `font-mono ${kpiSizeClass(outstandingLabel)} ${outstanding > 0 ? "text-destructive" : ""}`;

  return (
    <PageContainer maxWidth="wide">
      <PageHeader title={welcome} />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <KpiTile
          label="Rentas Activas"
          value={activeBookings.length}
          icon={CalendarDays}
          iconColor="text-primary"
        />
        <KpiTile
          label="Saldo Pendiente"
          value={<span className={balanceClass} title={outstandingLabel}>{outstandingLabel}</span>}
          icon={ExpenseIcon}
          iconColor={outstanding > 0 ? "text-destructive" : "text-success"}
        />
        <KpiTile
          label="Total de Facturas"
          value={invoiceList.length}
          icon={InvoiceIcon}
          iconColor="text-info"
        />
      </div>

      <PortalUpcomingDues invoices={unpaidInvoices} />
      {activeBookings.length > 0 && <PortalBookingsCard bookings={activeBookings} />}
      {recentInvoices.length > 0 && <PortalRecentInvoicesCard invoices={recentInvoices} />}
      {/* R7-FE-06 (N7-POR-02): cliente nuevo — orientación + siguiente paso. */}
      {activeBookings.length === 0 && invoiceList.length === 0 && (
        <Card>
          <CardContent className="pt-4 text-sm space-y-1">
            <p className="font-medium">Aún no tienes rentas ni facturas.</p>
            <p className="text-muted-foreground">
              Cuando tengas una renta activa aparecerá aquí. ¿Necesitas un montacargas?
              Solicita una cotización con tu ejecutivo de cuenta o contáctanos.
            </p>
          </CardContent>
        </Card>
      )}
    </PageContainer>
  );
}
