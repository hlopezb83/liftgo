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
import { derivePortalKpis } from "../lib/portalKpis";


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

function PortalEmptyState() {
  return (
    <Card>
      <CardContent className="pt-4 text-sm space-y-1">
        <p className="font-medium">Aún no tienes rentas ni facturas.</p>
        <p className="text-muted-foreground">
          Cuando tengas una renta activa aparecerá aquí. ¿Necesitas un montacargas?
          Solicita una cotización con tu ejecutivo de cuenta o contáctanos.
        </p>
      </CardContent>
    </Card>
  );
}

function balanceColor(outstanding: number): string {
  return outstanding > 0 ? "text-destructive" : "";
}

export default function PortalDashboard() {
  const { data: customer, isLoading: customerLoading, isError: customerError, refetch: refetchCustomer } = usePortalCustomer();
  const { data: bookings, isLoading: bookingsLoading, isError: bookingsError, refetch: refetchBookings } = usePortalBookings();
  const { data: invoices, isLoading: invoicesLoading, isError: invoicesError, refetch: refetchInvoices } = usePortalInvoices();

  if (customerLoading || bookingsLoading || invoicesLoading) return <PortalDashboardSkeleton />;

  // A-01: NUNCA renderizar KPIs en 0 ni "sin datos" cuando una query falló —
  // el cliente externo podría ver un saldo $0 falso durante un outage.
  if (customerError || bookingsError || invoicesError) {
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

  const { invoiceList, activeBookings, unpaidInvoices, recentInvoices, outstanding, fxMissingCount } =
    derivePortalKpis(bookings, invoices);
  const welcome = customer?.name ? `Bienvenido, ${customer.name}` : "Bienvenido";
  // Oleada 3 (C-3/C-2): formato compacto + escala tipográfica para no truncar el saldo.
  const outstandingLabel = formatCompactCurrency(outstanding);
  const balanceClass = `tabular-nums ${kpiSizeClass(outstandingLabel)} ${balanceColor(outstanding)}`;


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
          hint={fxMissingCount > 0
            ? `No incluye ${fxMissingCount} factura(s) en moneda extranjera sin tipo de cambio registrado.`
            : undefined}
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
      {recentInvoices.length > 0 && <PortalRecentInvoicesCard invoices={recentInvoices} totalCount={invoiceList.length} />}
      {/* R7-FE-06 (N7-POR-02): cliente nuevo — orientación + siguiente paso. */}
      {activeBookings.length === 0 && invoiceList.length === 0 && <PortalEmptyState />}
    </PageContainer>
  );
}
