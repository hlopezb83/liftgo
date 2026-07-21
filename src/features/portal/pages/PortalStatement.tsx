import { useId, useState } from "react";
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


export default function PortalStatement() {
  const { data: customer, isLoading: cl } = usePortalCustomer();
  const { data: invoices, isLoading: il } = usePortalInvoices();
  const { data: payments, isLoading: pl } = usePortalPayments();
  const { data: summary } = useCustomerSummary(customer?.id);
  const [onlyBalance, setOnlyBalance] = useState(false);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const onlyBalanceId = useId();

  const rows = (invoices ?? []).map((inv) => {
    const invPayments = (payments ?? []).filter((p: PortalPayment) => p.invoice_id === inv.id);
    // Saldos vienen del servidor (BL-43/44/45): total − pagado − NCs vigentes.
    const paid = Number(inv.paid_amount ?? 0);
    const credited = Number(inv.credited_amount ?? 0);
    const balance = Number(inv.balance ?? Math.max(Number(inv.total) - paid - credited, 0));
    return { inv, payments: invPayments, paid, credited, balance };
  });


  const filtered = onlyBalance ? rows.filter((r) => r.balance > 0.009) : rows;

  const totals = (() => {
    const invoiced = rows.reduce((s, r) => s + Number(r.inv.total), 0);
    const paid = rows.reduce((s, r) => s + r.paid, 0);
    const credited = rows.reduce((s, r) => s + r.credited, 0);
    const balance = rows.reduce((s, r) => s + r.balance, 0);
    return { invoiced, paid, credited, balance };
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
          <div className="flex items-center gap-2">
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
