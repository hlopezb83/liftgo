import { useState } from "react";
import { PageContainer } from "@/components/layout/PageContainer";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { DownloadIcon } from "@/components/icons";
import { formatCurrency } from "@/lib/format/formatCurrency";
import { useCustomerSummary, usePortalCustomer, usePortalInvoices, usePortalPayments } from "@/features/customers";
import { notifyError } from "@/lib/ui/appFeedback";
import { PortalInvoicesTable, type PortalPayment } from "../components/statement/PortalInvoicesTable";


export default function PortalStatement() {
  const { data: customer, isLoading: cl } = usePortalCustomer();
  const { data: invoices, isLoading: il } = usePortalInvoices();
  const { data: payments, isLoading: pl } = usePortalPayments();
  const { data: summary } = useCustomerSummary(customer?.id);
  const [onlyBalance, setOnlyBalance] = useState(false);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const rows = (invoices ?? []).map((inv) => {
    const invPayments = (payments ?? []).filter((p: PortalPayment) => p.invoice_id === inv.id);
    const paid = invPayments.reduce((s, p: PortalPayment) => s + Number(p.amount), 0);
    const balance = Number(inv.total) - paid;
    return { inv, payments: invPayments, paid, balance };
  });


  const filtered = onlyBalance ? rows.filter((r) => r.balance > 0.009) : rows;

  const totals = (() => {
    const invoiced = rows.reduce((s, r) => s + Number(r.inv.total), 0);
    const paid = rows.reduce((s, r) => s + r.paid, 0);
    return { invoiced, paid, balance: invoiced - paid };
  })();

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

  return (
    <PageContainer maxWidth="wide">
      <PageHeader
        title="Estado de Cuenta"
        actions={
          <Button variant="outline" onClick={handleDownload} disabled={!summary || !customer}>
            <DownloadIcon className="h-4 w-4 mr-2" /> Descargar PDF
          </Button>
        }
      />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card><CardContent className="pt-4">
          <p className="text-xs text-muted-foreground">Facturado total</p>
          <p className="text-xl font-bold font-mono">{formatCurrency(totals.invoiced)}</p>
        </CardContent></Card>
        <Card><CardContent className="pt-4">
          <p className="text-xs text-muted-foreground">Pagado total</p>
          <p className="text-xl font-bold font-mono text-status-available">{formatCurrency(totals.paid)}</p>
        </CardContent></Card>
        <Card><CardContent className="pt-4">
          <p className="text-xs text-muted-foreground">Saldo pendiente</p>
          <p className={`text-xl font-bold font-mono ${totals.balance > 0 ? "text-destructive" : ""}`}>
            {formatCurrency(totals.balance)}
          </p>
        </CardContent></Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Facturas</CardTitle>
          <label className="text-sm flex items-center gap-2">
            <input type="checkbox" checked={onlyBalance} onChange={(e) => setOnlyBalance(e.target.checked)} />
            Solo con saldo
          </label>
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
