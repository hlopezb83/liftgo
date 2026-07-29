import { useMemo } from "react";
import { useParams } from "react-router";
import { DataTableV2, useLiftgoTable, type ColumnDef } from "@/components/dataTable/v2";
import { QueryErrorState } from "@/components/feedback/QueryErrorState";
import { StatusBadge } from "@/components/feedback/StatusBadge";
import { DocumentIcon } from "@/components/icons";
import { PageContainer } from "@/components/layout/PageContainer";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useNavigateTransition } from "@/hooks/useNavigateTransition";
import { formatCurrencyWithCode } from "@/lib/format/formatCurrency";
import { formatDateDisplay } from "@/lib/utils";
import { InvoiceSummaryCards } from "../components/InvoiceSummaryCards";
import { TotalsBreakdown } from "../components/TotalsBreakdown";
import { useCfdiDownload } from "../hooks/useCfdiDownload";
import {
  usePortalInvoiceDetailData,
  type PortalLineItem as LineItem,
  type PortalPaymentRow as Payment,
} from "../hooks/usePortalInvoiceDetailData";


function buildLineColumns(currency: string): ColumnDef<LineItem>[] {
  return [
    { id: "description", header: "Descripción", accessorKey: "description", enableSorting: false, cell: ({ row }) => row.original.description || "—" },
    { id: "quantity", header: "Cant.", accessorKey: "quantity", enableSorting: false, meta: { kind: "money" }, cell: ({ row }) => row.original.quantity || 1 },
    { id: "unit_price", header: "Precio Unit.", accessorKey: "unit_price", enableSorting: false, meta: { kind: "money" }, cell: ({ row }) => formatCurrencyWithCode(Number(row.original.unit_price || 0), currency) },
    { id: "amount", header: "Importe", accessorKey: "amount", enableSorting: false, meta: { kind: "money" }, cell: ({ row }) => formatCurrencyWithCode(Number(row.original.amount || 0), currency) },
  ];
}

function buildPaymentColumns(currency: string): ColumnDef<Payment>[] {
  return [
    { id: "payment_date", header: "Fecha", accessorKey: "payment_date", cell: ({ row }) => formatDateDisplay(row.original.payment_date) },
    { id: "payment_method", header: "Método", accessorKey: "payment_method", enableSorting: false, cell: ({ row }) => row.original.payment_method || "—" },
    { id: "reference_number", header: "Referencia", accessorKey: "reference_number", enableSorting: false, cell: ({ row }) => row.original.reference_number || "—" },
    { id: "amount", header: "Monto", accessorFn: (p) => Number(p.amount), meta: { kind: "money" }, cell: ({ row }) => formatCurrencyWithCode(Number(row.original.amount), currency) },
  ];
}

interface InvoiceHeaderActionsProps {
  hasCfdi: boolean;
  showPay: boolean;
  downloading: "pdf" | "xml" | null;
  onDownload: (fmt: "pdf" | "xml") => void;
  onPay: () => void;
}

function InvoiceHeaderActions({ hasCfdi, showPay, downloading, onDownload, onPay }: InvoiceHeaderActionsProps) {
  const disabled = downloading !== null;
  return (
    <div className="flex flex-wrap items-center gap-2">
      {hasCfdi ? (
        <>
          <Button size="sm" variant="outline" onClick={() => onDownload("pdf")} disabled={disabled}>
            <DocumentIcon className="h-4 w-4 mr-1" />
            {downloading === "pdf" ? "Descargando…" : "PDF SAT"}
          </Button>
          <Button size="sm" variant="outline" onClick={() => onDownload("xml")} disabled={disabled}>
            <DocumentIcon className="h-4 w-4 mr-1" />
            {downloading === "xml" ? "Descargando…" : "XML SAT"}
          </Button>
        </>
      ) : null}
      {showPay ? <Button size="sm" onClick={onPay}>Pagar factura</Button> : null}
    </div>
  );
}

export default function PortalInvoiceDetail() {
  const { id } = useParams();
  const navigate = useNavigateTransition();
  const {
    invoice,
    invoicePayments,
    lineItems,
    currency,
    totalPaid,
    balance,
    hasCfdi,
    showPay,
    isLoading,
    isError,
    refetchAll,
  } = usePortalInvoiceDetailData(id);

  const lineColumns = useMemo(() => buildLineColumns(currency), [currency]);
  const paymentColumns = useMemo(() => buildPaymentColumns(currency), [currency]);

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

  const { downloading, download } = useCfdiDownload(invoice);

  if (isLoading) return <Skeleton className="h-96" />;
  if (isError) {
    return (
      <PageContainer maxWidth="wide">
        <QueryErrorState entity="la factura" onRetry={refetchAll} />
      </PageContainer>
    );
  }
  if (!invoice) return <p className="text-muted-foreground">Factura no encontrada</p>;


  return (
    <PageContainer maxWidth="wide">
      <PageHeader
        title={invoice.invoice_number}
        backHref="/portal/invoices"
        backLabel="Facturas"
        actions={
          <InvoiceHeaderActions
            hasCfdi={hasCfdi}
            showPay={showPay}
            downloading={downloading}
            onDownload={(fmt) => { void download(fmt); }}
            onPay={() => navigate(`/portal/invoices/${invoice.id}/pago`)}
          />
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
            <p className="text-xl font-bold font-mono">{formatCurrencyWithCode(Number(invoice.total), currency)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground">Pagado</p>
            <p className="text-xl font-bold font-mono text-status-available">{formatCurrencyWithCode(totalPaid, currency)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground">Saldo</p>
            <p className={`text-xl font-bold font-mono ${balanceCls}`}>
              {formatCurrencyWithCode(balance, currency)}
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
