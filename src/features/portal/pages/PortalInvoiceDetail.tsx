
import { useState } from "react";
import { useParams } from "react-router";
import { DataTableV2, useLiftgoTable, type ColumnDef } from "@/components/dataTable/v2";
import { StatusBadge } from "@/components/feedback/StatusBadge";
import { DocumentIcon } from "@/components/icons";
import { PageContainer } from "@/components/layout/PageContainer";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { usePortalInvoices, usePortalPayments } from "@/features/customers";
import { downloadCfdiBlob } from "@/features/invoices";
import { useNavigateTransition } from "@/hooks/useNavigateTransition";
import { formatCurrency } from "@/lib/format/formatCurrency";
import { notifyError } from "@/lib/ui/appFeedback";
import { formatDateDisplay } from "@/lib/utils";
import { TotalsBreakdown } from "../components/TotalsBreakdown";


type LineItem = { description?: string; quantity?: number; unit_price?: number; amount?: number };
type Payment = { id: string; payment_date: string; payment_method: string | null; reference_number: string | null; amount: number | string };

export default function PortalInvoiceDetail() {
  const { id } = useParams();
  const navigate = useNavigateTransition();
  const { data: invoices, isLoading: invoicesLoading } = usePortalInvoices();
  const { data: payments, isLoading: paymentsLoading } = usePortalPayments();
  const isLoading = invoicesLoading || paymentsLoading;

  const invoice = invoices?.find((i) => i.id === id);
  const invoicePayments: Payment[] = (payments?.filter((p) => p.invoice_id === id) || []) as Payment[];
  const lineItems: LineItem[] = Array.isArray(invoice?.line_items) ? (invoice?.line_items as LineItem[]) : [];

  const lineColumns: ColumnDef<LineItem>[] = [
    { id: "description", header: "Descripción", accessorKey: "description", enableSorting: false, cell: ({ row }) => row.original.description || "—" },
    { id: "quantity", header: "Cant.", accessorKey: "quantity", enableSorting: false, meta: { align: "right" }, cell: ({ row }) => row.original.quantity || 1 },
    { id: "unit_price", header: "Precio Unit.", accessorKey: "unit_price", enableSorting: false, meta: { align: "right" }, cell: ({ row }) => <span className="font-mono">{formatCurrency(Number(row.original.unit_price || 0))}</span> },
    { id: "amount", header: "Importe", accessorKey: "amount", enableSorting: false, meta: { align: "right" }, cell: ({ row }) => <span className="font-mono">{formatCurrency(Number(row.original.amount || 0))}</span> },
  ];

  const paymentColumns: ColumnDef<Payment>[] = [
    { id: "payment_date", header: "Fecha", accessorKey: "payment_date", cell: ({ row }) => formatDateDisplay(row.original.payment_date) },
    { id: "payment_method", header: "Método", accessorKey: "payment_method", enableSorting: false, cell: ({ row }) => row.original.payment_method || "—" },
    { id: "reference_number", header: "Referencia", accessorKey: "reference_number", enableSorting: false, cell: ({ row }) => row.original.reference_number || "—" },
    { id: "amount", header: "Monto", accessorFn: (p) => Number(p.amount), meta: { align: "right" }, cell: ({ row }) => <span className="font-mono">{formatCurrency(Number(row.original.amount))}</span> },
  ];

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
  const [downloading, setDownloading] = useState<"pdf" | "xml" | null>(null);

  if (isLoading) return <Skeleton className="h-96" />;
  if (!invoice) return <p className="text-muted-foreground">Factura no encontrada</p>;

  const totalPaid = invoicePayments.reduce((sum, p) => sum + Number(p.amount), 0);
  // v7.209.0 A3: restar credited_amount (NCs timbradas) para alinear el saldo
  // del detalle con el estado de cuenta del portal y con la vista interna.
  const balance = Number(invoice.total) - totalPaid - Number(invoice.credited_amount ?? 0);
  const hasCfdi = Boolean(invoice.cfdi_uuid);

  const download = async (fmt: "pdf" | "xml") => {
    if (!invoice.cfdi_uuid) return;
    setDownloading(fmt);
    try {
      await downloadCfdiBlob({ invoice_id: invoice.id }, fmt, `${invoice.invoice_number}.${fmt}`);
    } catch (err: unknown) {
      notifyError({ error: err, message: `No se pudo descargar el ${fmt.toUpperCase()} SAT` });
    } finally {
      setDownloading(null);
    }
  };

  return (
    <PageContainer maxWidth="wide">
      <PageHeader
        title={invoice.invoice_number}
        backHref="/portal/invoices"
        backLabel="Facturas"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {hasCfdi && (
              <>
                <Button size="sm" variant="outline" onClick={() => download("pdf")} disabled={downloading !== null}>
                  <DocumentIcon className="h-4 w-4 mr-1" />
                  {downloading === "pdf" ? "Descargando…" : "PDF SAT"}
                </Button>
                <Button size="sm" variant="outline" onClick={() => download("xml")} disabled={downloading !== null}>
                  <DocumentIcon className="h-4 w-4 mr-1" />
                  {downloading === "xml" ? "Descargando…" : "XML SAT"}
                </Button>
              </>
            )}
            {balance > 0 && invoice.status !== "cancelled" ? (
              <Button size="sm" onClick={() => navigate(`/portal/invoices/${invoice.id}/pago`)}>Pagar factura</Button>
            ) : null}
          </div>
        }
      />
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <StatusBadge status={invoice.status} />
        <span>Emitida: {formatDateDisplay(invoice.issued_at)}</span>
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
          <div className="mt-4 border-t pt-3">
            <TotalsBreakdown
              subtotal={invoice.subtotal}
              taxRate={invoice.tax_rate}
              taxAmount={invoice.tax_amount}
              total={invoice.total}
            />
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
    </PageContainer>
  );
}
