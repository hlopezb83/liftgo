import { useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { DataTableV2, useLiftgoTable, type ColumnDef } from "@/components/dataTable/v2";
import { StatusBadge } from "@/components/StatusBadge";
import { usePortalInvoices, usePortalPayments } from "@/features/customers/hooks/customers/useCustomerPortal";
import { formatCurrency } from "@/lib/formatCurrency";
import { ArrowLeft } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDateDisplay } from "@/lib/utils";

type LineItem = { description?: string; quantity?: number; unit_price?: number; amount?: number };
type Payment = { id: string; payment_date: string; payment_method: string | null; reference_number: string | null; amount: number | string };

export default function PortalInvoiceDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { data: invoices, isLoading: invoicesLoading } = usePortalInvoices();
  const { data: payments, isLoading: paymentsLoading } = usePortalPayments();
  const isLoading = invoicesLoading || paymentsLoading;

  const invoice = invoices?.find((i) => i.id === id);
  const invoicePayments = useMemo<Payment[]>(
    () => (payments?.filter((p) => p.invoice_id === id) || []) as Payment[],
    [payments, id],
  );
  const lineItems = useMemo<LineItem[]>(
    () => (Array.isArray(invoice?.line_items) ? (invoice?.line_items as LineItem[]) : []),
    [invoice],
  );

  const lineColumns = useMemo<ColumnDef<LineItem>[]>(
    () => [
      { id: "description", header: "Descripción", accessorKey: "description", enableSorting: false, cell: ({ row }) => row.original.description || "—" },
      { id: "quantity", header: "Cant.", accessorKey: "quantity", enableSorting: false, meta: { align: "right" }, cell: ({ row }) => row.original.quantity || 1 },
      { id: "unit_price", header: "Precio Unit.", accessorKey: "unit_price", enableSorting: false, meta: { align: "right" }, cell: ({ row }) => <span className="font-mono">{formatCurrency(Number(row.original.unit_price || 0))}</span> },
      { id: "amount", header: "Importe", accessorKey: "amount", enableSorting: false, meta: { align: "right" }, cell: ({ row }) => <span className="font-mono">{formatCurrency(Number(row.original.amount || 0))}</span> },
    ],
    [],
  );

  const paymentColumns = useMemo<ColumnDef<Payment>[]>(
    () => [
      { id: "payment_date", header: "Fecha", accessorKey: "payment_date", cell: ({ row }) => formatDateDisplay(row.original.payment_date) },
      { id: "payment_method", header: "Método", accessorKey: "payment_method", enableSorting: false, cell: ({ row }) => row.original.payment_method || "—" },
      { id: "reference_number", header: "Referencia", accessorKey: "reference_number", enableSorting: false, cell: ({ row }) => row.original.reference_number || "—" },
      { id: "amount", header: "Monto", accessorFn: (p) => Number(p.amount), meta: { align: "right" }, cell: ({ row }) => <span className="font-mono">{formatCurrency(Number(row.original.amount))}</span> },
    ],
    [],
  );

  const lineTable = useLiftgoTable<LineItem>({
    data: lineItems,
    columns: lineColumns,
    getRowId: (_, idx) => String(idx),
    paginated: false,
  });

  const paymentsTable = useLiftgoTable<Payment>({
    data: invoicePayments,
    columns: paymentColumns,
    getRowId: (p) => p.id,
    initialSorting: [{ id: "payment_date", desc: true }],
    paginated: false,
  });

  if (isLoading) return <Skeleton className="h-96" />;
  if (!invoice) return <p className="text-muted-foreground">Factura no encontrada</p>;

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
          <DataTableV2 table={lineTable} emptyMessage="Sin partidas" />
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
          <DataTableV2 table={paymentsTable} emptyMessage="Sin pagos registrados" />
        </CardContent>
      </Card>
    </div>
  );
}
