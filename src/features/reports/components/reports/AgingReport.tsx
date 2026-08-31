import { differenceInCalendarDays, differenceInDays, parseISO, subDays } from "date-fns";
import { useState } from "react";
import { DataTableV2, useLiftgoTable, type ColumnDef } from "@/components/dataTable/v2";
import { QueryErrorState } from "@/components/feedback/QueryErrorState";
import { DownloadIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useInvoicesWithBalance } from "@/features/invoices";
import { useNavigateTransition } from "@/hooks/useNavigateTransition";
import { exportToCsv } from "@/lib/exportCsv";
import { formatDateMty, toYMD } from "@/lib/format/dateFormats";
import { formatCurrency } from "@/lib/format/formatCurrency";
import { toMxn } from "@/lib/money";
import { nowMty } from "@/lib/utils";
import { AgingBucketCards } from "./drilldown/AgingBucketCards";


interface AgingReportProps {
  startDate: Date;
  endDate: Date;
}

function getAgingBucket(days: number): string {
  if (days <= 30) return "0-30";
  if (days <= 60) return "31-60";
  if (days <= 90) return "61-90";
  return "90+";
}

export function AgingReport({ startDate: _startDate, endDate: _endDate }: AgingReportProps) {
  const navigate = useNavigateTransition();
  const [selectedBucket, setSelectedBucket] = useState<string | null>(null);
  // M-13: la definición canónica de vencida (v_overdue_invoices) exige
  // due_date < hoy (>= 1 día de atraso). `p_due_to` del RPC es INCLUSIVO,
  // así que se pasa "ayer" — con "hoy" entraban facturas que vencen hoy.
  const yesterdayYmd = toYMD(subDays(nowMty(), 1));

  // Vista unificada: ya viene con balance > 0 y status filtrado.
  const { data: rawOverdue, isError, isFetching, refetch } = useInvoicesWithBalance({
    statuses: ["sent", "partial", "overdue"],
    dueTo: yesterdayYmd,
  });

  const overdueInvoices = (rawOverdue ?? [])
    // Doble guarda client-side: >= 1 día calendario de atraso (no basta
    // `due < now`, que cuenta las que vencen hoy a medianoche).
    .filter((i) => i.due_date && differenceInCalendarDays(nowMty(), parseISO(i.due_date)) >= 1)
    .map((i) => {
      const days = differenceInDays(nowMty(), parseISO(i.due_date as string));
      // R6-B2: normalizar a MXN. Preferir balance_mxn del servidor; fallback toMxn.
      // H-2: si la factura está en divisa sin tipo de cambio, balance_mxn queda
      // en null y la fila se excluye de los totales (antes sumaba USD como MXN).
      const balanceMxn = i.fx_missing
        ? null
        : i.balance_mxn != null
          ? Number(i.balance_mxn)
          : toMxn(Number(i.balance), i.moneda, i.tipo_cambio);
      return { ...i, days_overdue: days, bucket: getAgingBucket(days), balance_mxn: balanceMxn };
    });

  const bucketTotals: Record<string, number> = { "0-30": 0, "31-60": 0, "61-90": 0, "90+": 0 };
  overdueInvoices.forEach((i) => { if (i.balance_mxn != null) bucketTotals[i.bucket] += i.balance_mxn; });
  const fxMissingCount = overdueInvoices.filter((i) => i.balance_mxn == null).length;

  const grandTotal = Object.values(bucketTotals).reduce((s, v) => s + v, 0);
  const visibleInvoices = selectedBucket
    ? overdueInvoices.filter((i) => i.bucket === selectedBucket)
    : overdueInvoices;
  const visibleTotal = visibleInvoices.reduce((s, i) => s + (i.balance_mxn ?? 0), 0);

  type Row = typeof overdueInvoices[number];
  const columns: ColumnDef<Row>[] = [
    { id: "invoice_number", header: "Factura", accessorKey: "invoice_number", cell: ({ row }) => <span className="font-mono font-medium">{row.original.invoice_number}</span> },
    { id: "customer_name", header: "Cliente", accessorKey: "customer_name", cell: ({ row }) => row.original.customer_name || "—" },
    { id: "total", header: "Saldo (MXN)", accessorFn: (i) => i.balance_mxn ?? -1, meta: { kind: "money" }, cell: ({ row }) => (
      row.original.balance_mxn == null
        ? <span className="text-warning" title="Factura en divisa sin tipo de cambio capturado">Sin T.C.</span>
        : formatCurrency(row.original.balance_mxn)
    ) },
    { id: "due_date", header: "Vencimiento", accessorKey: "due_date", cell: ({ row }) => formatDateMty(row.original.due_date) },
    { id: "days_overdue", header: "Días", accessorKey: "days_overdue", meta: { kind: "money" }, cell: ({ row }) => <span className="font-mono font-semibold text-destructive">{row.original.days_overdue}</span> },
    { id: "bucket", header: "Bucket", accessorKey: "bucket", cell: ({ row }) => `${row.original.bucket}d` },
  ];

  const table = useLiftgoTable<Row>({
    data: visibleInvoices,
    columns,
    getRowId: (i) => i.id,
    initialSorting: [{ id: "days_overdue", desc: true }],
    paginated: false,
  });


  const handleExport = () => {
    exportToCsv("antiguedad_cartera.csv", visibleInvoices.map((i) => ({
      Factura: i.invoice_number,
      Cliente: i.customer_name || "",
      Moneda: i.moneda || "MXN",
      "Tipo Cambio": i.tipo_cambio ?? 1,
      Total: i.total,
      Saldo: i.balance,
      "Saldo MXN": i.balance_mxn ?? "",
      "Fecha Vencimiento": i.due_date || "",
      "Días Vencida": i.days_overdue,
      Bucket: i.bucket,
      Estado: i.status,
    })));
  };


  // R22-B: cartera vencida en cero por falla de red es un dato peligroso.
  if (isError) {
    return (
      <QueryErrorState
        entity="el reporte de antigüedad de saldos"
        onRetry={() => { void refetch(); }}
        isRetrying={isFetching}
      />
    );
  }

  return (
    <div className="space-y-4">
      <AgingBucketCards totals={bucketTotals} selected={selectedBucket} onSelect={setSelectedBucket} />

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">
              Detalle de cartera vencida{selectedBucket ? ` (${selectedBucket} días)` : ""} — Total: {formatCurrency(selectedBucket ? visibleTotal : grandTotal)}
            </CardTitle>
            <Button variant="outline" size="sm" onClick={handleExport}>
              <DownloadIcon className="h-4 w-4 mr-1" /> Exportar CSV
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {fxMissingCount > 0 && (
            <p className="mb-3 rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-muted-foreground">
              {fxMissingCount} factura{fxMissingCount === 1 ? "" : "s"} en divisa sin tipo de cambio
              {fxMissingCount === 1 ? " no suma" : " no suman"} a los totales en MXN. Captura el tipo de
              cambio en la factura para incluirla.
            </p>
          )}

          <DataTableV2
            table={table}
            emptyMessage="No hay facturas vencidas"
            onRowClick={(i) => navigate(`/invoices/${i.id}`)}
          />
        </CardContent>
      </Card>

    </div>
  );
}
