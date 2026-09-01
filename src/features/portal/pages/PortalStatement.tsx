import { useId, useState } from "react";
import { QueryErrorState } from "@/components/feedback/QueryErrorState";
import { DownloadIcon } from "@/components/icons";
import { PageContainer } from "@/components/layout/PageContainer";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { useCustomerSummary, usePortalCustomer, usePortalInvoices, usePortalPayments } from "@/features/customers";
import { formatCurrency } from "@/lib/format/formatCurrency";
import { notifyError } from "@/lib/ui/appFeedback";
import { PortalInvoicesTable, type PortalPayment } from "../components/statement/PortalInvoicesTable";
import { buildStatementRows, filterWithBalance, sumStatementTotals } from "../lib/statementRows";


export default function PortalStatement() {
  const { data: customer, isLoading: cl, isError: ce, refetch: rc } = usePortalCustomer();
  const { data: invoices, isLoading: il, isError: ie, refetch: ri } = usePortalInvoices();
  const { data: payments, isLoading: pl, isError: pe, refetch: rp } = usePortalPayments();
  const { data: summary } = useCustomerSummary(customer?.id);
  const [onlyBalance, setOnlyBalance] = useState(false);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const onlyBalanceId = useId();

  // R6-B2 / R8-04: totales en MXN excluyendo divisas sin tipo de cambio.
  const rows = buildStatementRows(invoices, (payments ?? []) as PortalPayment[]);
  const filtered = onlyBalance ? filterWithBalance(rows) : rows;
  const totals = sumStatementTotals(rows);



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

  if (cl || il || pl) return <Skeleton className="h-96" />;

  if (ce || ie || pe) {
    return (
      <PageContainer maxWidth="wide">
        <PageHeader title="Estado de Cuenta" />
        <QueryErrorState
          entity="tu estado de cuenta"
          onRetry={() => {
            void rc();
            void ri();
            void rp();
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
            disabled={!summary || !customer || rows.length === 0}
            title={rows.length === 0 ? "Aún no hay facturas: el estado de cuenta está vacío" : undefined}
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

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Facturas</CardTitle>
          <div className="flex items-center gap-2 no-print">
            <Checkbox
              id={onlyBalanceId}
              checked={onlyBalance}
              onCheckedChange={(v) => setOnlyBalance(v === true)}
            />
            <Label htmlFor={onlyBalanceId} className="text-sm cursor-pointer">Solo con saldo</Label>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <PortalInvoicesTable
            rows={filtered}
            expanded={expanded}
            onToggle={(id) => setExpanded((s) => ({ ...s, [id]: !s[id] }))}
          />
        </CardContent>

      </Card>
    </PageContainer>
  );
}
