import { useMemo, useState } from "react";
import { PageContainer } from "@/components/layout/PageContainer";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/feedback/StatusBadge";
import { Download, ChevronDown, ChevronRight } from "lucide-react";
import { formatCurrency } from "@/lib/format/formatCurrency";
import { formatDateDisplay } from "@/lib/utils";
import { useCustomerSummary, usePortalCustomer, usePortalInvoices, usePortalPayments } from "@/features/customers";

import { notifyError } from "@/lib/ui/appFeedback";

type Payment = { id: string; invoice_id: string | null; payment_date: string; payment_method: string | null; reference_number: string | null; amount: number | string };

export default function PortalStatement() {
  const { data: customer, isLoading: cl } = usePortalCustomer();
  const { data: invoices, isLoading: il } = usePortalInvoices();
  const { data: payments, isLoading: pl } = usePortalPayments();
  const { data: summary } = useCustomerSummary(customer?.id);
  const [onlyBalance, setOnlyBalance] = useState(false);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const rows = useMemo(() => {
    const list = invoices ?? [];
    return list.map((inv) => {
      const invPayments = (payments ?? []).filter((p: Payment) => p.invoice_id === inv.id);
      const paid = invPayments.reduce((s, p: Payment) => s + Number(p.amount), 0);
      const balance = Number(inv.total) - paid;
      return { inv, payments: invPayments, paid, balance };
    });
  }, [invoices, payments]);

  const filtered = onlyBalance ? rows.filter((r) => r.balance > 0.009) : rows;

  const totals = useMemo(() => {
    const invoiced = rows.reduce((s, r) => s + Number(r.inv.total), 0);
    const paid = rows.reduce((s, r) => s + r.paid, 0);
    return { invoiced, paid, balance: invoiced - paid };
  }, [rows]);

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
            <Download className="h-4 w-4 mr-2" /> Descargar PDF
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
          <table className="w-full text-sm">
            <thead className="text-xs text-muted-foreground bg-muted/40">
              <tr>
                <th className="w-8"></th>
                <th className="text-left px-3 py-2">Factura #</th>
                <th className="text-left px-3 py-2">Emisión</th>
                <th className="text-left px-3 py-2">Vencimiento</th>
                <th className="text-right px-3 py-2">Total</th>
                <th className="text-right px-3 py-2">Pagado</th>
                <th className="text-right px-3 py-2">Saldo</th>
                <th className="text-left px-3 py-2">Estado</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr><td colSpan={9} className="text-center py-6 text-muted-foreground">Sin facturas</td></tr>
              )}
              {filtered.map((r, idx) => {
                const isOpen = expanded[r.inv.id];
                return (
                  <>
                    <tr key={r.inv.id} className={idx % 2 ? "bg-muted/20" : ""}>
                      <td className="px-2">
                        <button onClick={() => setExpanded((s) => ({ ...s, [r.inv.id]: !s[r.inv.id] }))}>
                          {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                        </button>
                      </td>
                      <td className="px-3 py-2 font-medium">{r.inv.invoice_number}</td>
                      <td className="px-3 py-2">{formatDateDisplay(r.inv.issued_at)}</td>
                      <td className="px-3 py-2">{r.inv.due_date ? formatDateDisplay(r.inv.due_date) : "—"}</td>
                      <td className="px-3 py-2 text-right font-mono">{formatCurrency(Number(r.inv.total))}</td>
                      <td className="px-3 py-2 text-right font-mono text-status-available">{formatCurrency(r.paid)}</td>
                      <td className={`px-3 py-2 text-right font-mono ${r.balance > 0 ? "text-destructive" : ""}`}>
                        {formatCurrency(r.balance)}
                      </td>
                      <td className="px-3 py-2"><StatusBadge status={r.inv.status} /></td>
                      <td className="px-3 py-2 text-right">
                        {r.balance > 0 && (
                          <Button size="sm" variant="outline" asChild>
                            <a href={`/portal/invoices/${r.inv.id}/pago`}>Pagar</a>
                          </Button>
                        )}
                      </td>
                    </tr>
                    {isOpen && (
                      <tr key={`${r.inv.id}-detail`} className="bg-muted/30">
                        <td colSpan={9} className="px-6 py-3">
                          {r.payments.length === 0 ? (
                            <p className="text-xs text-muted-foreground">Sin pagos aplicados.</p>
                          ) : (
                            <table className="w-full text-xs">
                              <thead><tr className="text-muted-foreground">
                                <th className="text-left">Fecha</th><th className="text-left">Método</th>
                                <th className="text-left">Referencia</th><th className="text-right">Monto</th>
                              </tr></thead>
                              <tbody>
                                {r.payments.map((p) => (
                                  <tr key={p.id}>
                                    <td>{formatDateDisplay(p.payment_date)}</td>
                                    <td>{p.payment_method ?? "—"}</td>
                                    <td>{p.reference_number ?? "—"}</td>
                                    <td className="text-right font-mono">{formatCurrency(Number(p.amount))}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          )}
                        </td>
                      </tr>
                    )}
                  </>
                );
              })}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </PageContainer>
  );
}
