import { useEffect, useId, useState } from "react";
import { QueryErrorState } from "@/components/feedback/QueryErrorState";
import { TablePagination } from "@/components/feedback/TablePagination";
import { DownloadIcon } from "@/components/icons";
import { PageContainer } from "@/components/layout/PageContainer";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { useCustomerSummary, usePortalCustomer, usePortalInvoicesPage } from "@/features/customers";
import { formatCurrency } from "@/lib/format/formatCurrency";
import { notifyError } from "@/lib/ui/appFeedback";
import { PortalInvoicesTable } from "../components/statement/PortalInvoicesTable";
import { buildStatementRows } from "../lib/statementRows";

const PAGE_SIZE = 25;

// La página compone tres consultas independientes para no ocultar fallos del
// resumen, cliente o facturas detrás de un estado parcial engañoso.
// eslint-disable-next-line complexity
export default function PortalStatement() {
  const { data: customer, isLoading: cl, isError: ce, refetch: rc } = usePortalCustomer();
  const [page, setPage] = useState(1);
  const [onlyBalance, setOnlyBalance] = useState(false);
  const { data: invoicePage, isLoading: il, isError: ie, refetch: ri } =
    usePortalInvoicesPage(page, PAGE_SIZE, onlyBalance);
  const {
    data: summary,
    isLoading: sl,
    isError: se,
    refetch: rs,
  } = useCustomerSummary(customer?.id);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const onlyBalanceId = useId();

  // La tabla se pagina en servidor y los pagos se cargan sólo al expandir una
  // factura. Los KPI vienen del resumen autoritativo completo, no de la página.
  const rows = buildStatementRows(invoicePage?.rows, []);
  const totalPages = Math.max(1, Math.ceil((invoicePage?.totalCount ?? 0) / PAGE_SIZE));
  const totals = {
    invoiced: Number(summary?.totals.total_invoiced ?? 0),
    paid: Number(summary?.totals.total_paid ?? 0),
    balance: Number(summary?.totals.outstanding_revenue ?? 0),
    fxMissingCount: Number(summary?.totals.fx_missing_count ?? 0),
  };

  useEffect(() => {
    if (page <= totalPages) return;
    const timer = window.setTimeout(() => setPage(totalPages), 0);
    return () => window.clearTimeout(timer);
  }, [page, totalPages]);



  const handleDownload = async () => {
    if (!customer || !summary) return;
    try {
      // Lazy: keep @react-pdf/renderer out of the initial bundle.
      const { exportCustomerStatementPdf } = await import("@/lib/pdf/customerStatement");
      await exportCustomerStatementPdf({ customer, summary });
    } catch (e: unknown) {
      notifyError({
        error: e,
        title: "No se pudo generar el PDF",
        phase: "exportCustomerStatementPdf",
        context: { customer_id: customer.id },
      });
    }
  };

  if (cl || il || sl) return <Skeleton className="h-96" />;

  if (ce || ie || se) {
    return (
      <PageContainer maxWidth="wide">
        <PageHeader title="Estado de Cuenta" />
        <QueryErrorState
          entity="tu estado de cuenta"
          onRetry={() => {
            void rc();
            void ri();
            void rs();
          }}
        />
      </PageContainer>
    );
  }

  return (
    <PageContainer maxWidth="wide">
      <PageHeader
        title="Estado de Cuenta"
        actions={
          <Button
            variant="outline"
            onClick={handleDownload}
            // R7-FE-09d (N7-POR-07): sin facturas el PDF saldría vacío.
            disabled={!summary || !customer || summary.invoices.length === 0}
            title={summary?.invoices.length === 0 ? "Aún no hay facturas: el estado de cuenta está vacío" : undefined}
            className="no-print"
          >
            <DownloadIcon className="h-4 w-4 mr-2" /> Descargar PDF
          </Button>
        }
      />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card><CardContent className="pt-4">
          <p className="text-xs text-muted-foreground">Facturado total</p>
          <p className="text-xl font-bold tabular-nums">{formatCurrency(totals.invoiced)}</p>
        </CardContent></Card>
        <Card><CardContent className="pt-4">
          <p className="text-xs text-muted-foreground">Pagado total</p>
          <p className="text-xl font-bold tabular-nums text-status-available">{formatCurrency(totals.paid)}</p>
        </CardContent></Card>
        <Card><CardContent className="pt-4">
          <p className="text-xs text-muted-foreground">Saldo pendiente</p>
          <p className={`text-xl font-bold tabular-nums ${totals.balance > 0 ? "text-destructive" : ""}`}>
            {formatCurrency(totals.balance)}
          </p>
        </CardContent></Card>
      </div>

      {totals.fxMissingCount > 0 && (
        <p className="text-xs text-muted-foreground">
          Los totales no incluyen {totals.fxMissingCount} factura(s) en moneda extranjera sin tipo de cambio registrado.
        </p>
      )}


      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Facturas</CardTitle>
          <div className="flex items-center gap-2 no-print">
            <Checkbox
              id={onlyBalanceId}
              checked={onlyBalance}
              onCheckedChange={(v) => {
                setExpanded({});
                setPage(1);
                setOnlyBalance(v === true);
              }}
            />
            <Label htmlFor={onlyBalanceId} className="text-sm cursor-pointer">Solo con saldo</Label>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <PortalInvoicesTable
            rows={rows}
            expanded={expanded}
            onToggle={(id) => setExpanded((s) => ({ ...s, [id]: !s[id] }))}
          />
        </CardContent>
        <div className="border-t px-4">
          <TablePagination
            page={page}
            totalPages={totalPages}
            onPageChange={(next) => { setExpanded({}); setPage(next); }}
          />
        </div>
      </Card>
    </PageContainer>
  );
}
