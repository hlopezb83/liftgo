import { useParams, useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { DataTable, type DataTableColumn } from "@/components/DataTable";
import { StatusBadge } from "@/components/StatusBadge";
import { usePortalInvoices, usePortalPayments } from "@/features/customers/hooks/customers/useCustomerPortal";
import { formatCurrency } from "@/lib/formatCurrency";
import { ArrowLeft } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDateDisplay } from "@/lib/utils";

export default function PortalInvoiceDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { data: invoices, isLoading: invoicesLoading } = usePortalInvoices();
  const { data: payments, isLoading: paymentsLoading } = usePortalPayments();
  const isLoading = invoicesLoading || paymentsLoading;

  if (isLoading) return <Skeleton className="h-96" />;

  const invoice = invoices?.find((i) => i.id === id);
  const invoicePayments = payments?.filter((p) => p.invoice_id === id) || [];

  if (!invoice) {
    return <p className="text-muted-foreground">Factura no encontrada</p>;
  }

  const lineItems = Array.isArray(invoice.line_items) ? invoice.line_items : [];
  const totalPaid = invoicePayments.reduce((sum, p) => sum + Number(p.amount), 0);
  const balance = Number(invoice.total) - totalPaid;

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate("/portal/invoices")}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold">{invoice.invoice_number}</h1>
          <div className="flex items-center gap-2 mt-1">
            <StatusBadge status={invoice.status} />
            <span className="text-sm text-muted-foreground">Emitida: {formatDateDisplay(invoice.issued_at)}</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground">Total</p>
            <p className="text-xl font-bold font-mono">{formatCurrency(Number(invoice.total))}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground">Pagado</p>
            <p className="text-xl font-bold font-mono text-status-available">{formatCurrency(totalPaid)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground">Saldo</p>
            <p className={`text-xl font-bold font-mono ${balance > 0 ? "text-destructive" : ""}`}>
              {formatCurrency(balance)}
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Partidas</CardTitle>
        </CardHeader>
        <CardContent className="p-0 pt-0">
          <DataTable<{ description?: string; quantity?: number; unit_price?: number; amount?: number }>
            data={lineItems as Array<{ description?: string; quantity?: number; unit_price?: number; amount?: number }>}
            keyExtractor={(_, idx) => String(idx)}
            emptyMessage="Sin partidas"
            columns={[
              { key: "description", label: "Descripción", render: (item) => item.description || "—" },
              { key: "quantity", label: "Cant.", align: "right", render: (item) => item.quantity || 1 },
              { key: "unit_price", label: "Precio Unit.", align: "right", render: (item) => <span className="font-mono">{formatCurrency(Number(item.unit_price || 0))}</span> },
              { key: "amount", label: "Importe", align: "right", render: (item) => <span className="font-mono">{formatCurrency(Number(item.amount || 0))}</span> },
            ]}
          />
          <div className="mt-4 border-t pt-3 space-y-1 text-sm text-right">
            <div className="flex justify-end gap-8">
              <span className="text-muted-foreground">Subtotal</span>
              <span className="font-mono">{formatCurrency(Number(invoice.subtotal))}</span>
            </div>
            <div className="flex justify-end gap-8">
              <span className="text-muted-foreground">IVA ({invoice.tax_rate}%)</span>
              <span className="font-mono">{formatCurrency(Number(invoice.tax_amount))}</span>
            </div>
            <div className="flex justify-end gap-8 font-bold">
              <span>Total</span>
              <span className="font-mono">{formatCurrency(Number(invoice.total))}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Historial de Pagos</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <DataTable
            data={invoicePayments}
            keyExtractor={(p) => p.id}
            emptyMessage="Sin pagos registrados"
            defaultSortKey="payment_date"
            defaultSortDirection="desc"
            columns={[
              { key: "payment_date", label: "Fecha", sortable: true, render: (p) => formatDateDisplay(p.payment_date) },
              { key: "payment_method", label: "Método", render: (p) => p.payment_method || "—" },
              { key: "reference_number", label: "Referencia", render: (p) => p.reference_number || "—" },
              { key: "amount", label: "Monto", sortable: true, align: "right", accessor: (p) => Number(p.amount), render: (p) => <span className="font-mono">{formatCurrency(Number(p.amount))}</span> },
            ]}
          />
        </CardContent>
      </Card>
    </div>
  );
}
