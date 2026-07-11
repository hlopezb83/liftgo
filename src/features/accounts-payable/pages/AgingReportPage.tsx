import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DownloadIcon, FileClock } from "@/components/icons";
import { formatCurrency } from "@/lib/format/formatCurrency";
import { exportToCsv } from "@/lib/exportCsv";
import { TableSkeleton } from "@/components/feedback/TableSkeleton";
import { EmptyState } from "@/components/feedback/EmptyState";
import { PageHeader } from "@/components/layout/PageHeader";
import { PageContainer } from "@/components/layout/PageContainer";
import { useAgingReport } from "../hooks/useAgingReport";

const COLS: { key: keyof import("../hooks/useAgingReport").AgingRow; label: string }[] = [
  { key: "current", label: "Corriente" },
  { key: "d1_30", label: "1–30 días" },
  { key: "d31_60", label: "31–60 días" },
  { key: "d61_90", label: "61–90 días" },
  { key: "d90_plus", label: "+90 días" },
];

export default function AgingReportPage() {
  const { rows, totals, isLoading } = useAgingReport();

  const overduePct = totals.total > 0
    ? ((totals.d1_30 + totals.d31_60 + totals.d61_90 + totals.d90_plus) / totals.total) * 100
    : 0;

  const handleExport = () => {
    exportToCsv(
      "antiguedad-cuentas-por-pagar.csv",
      rows.map((r) => ({
        Proveedor: r.supplierName,
        Corriente: r.current,
        "1-30": r.d1_30,
        "31-60": r.d31_60,
        "61-90": r.d61_90,
        "+90": r.d90_plus,
        Total: r.total,
      })),
    );
  };

  return (
    <PageContainer>
      <PageHeader
        title="Antigüedad de Saldos"
        subtitle="Saldos pendientes agrupados por proveedor y días de vencimiento"
        backHref="/cuentas-por-pagar"
        backLabel="Cuentas por pagar"
        actions={
          <Button variant="outline" onClick={handleExport} disabled={rows.length === 0}>
            <DownloadIcon className="h-4 w-4 mr-1" />Exportar CSV
          </Button>
        }
      />


      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card><CardContent className="p-4">
          <p className="text-xs text-muted-foreground">Cartera total</p>
          <p className="text-xl font-bold font-mono">{formatCurrency(totals.total)}</p>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <p className="text-xs text-muted-foreground">Corriente</p>
          <p className="text-xl font-bold font-mono text-success">{formatCurrency(totals.current)}</p>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <p className="text-xs text-muted-foreground">Vencido</p>
          <p className="text-xl font-bold font-mono text-destructive">
            {formatCurrency(totals.d1_30 + totals.d31_60 + totals.d61_90 + totals.d90_plus)}
          </p>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <p className="text-xs text-muted-foreground">% vencido</p>
          <p className="text-xl font-bold font-mono">{overduePct.toFixed(1)}%</p>
        </CardContent></Card>
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-4"><TableSkeleton columnCount={7} rows={5} /></div>
          ) : rows.length === 0 ? (
            <EmptyState icon={FileClock} title="Sin saldos pendientes" subtitle="Todas las facturas están pagadas o canceladas." />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Proveedor</TableHead>
                  {COLS.map((c) => <TableHead key={c.key} className="text-right">{c.label}</TableHead>)}
                  <TableHead className="text-right">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.supplierId}>
                    <TableCell className="font-medium">{r.supplierName}</TableCell>
                    {COLS.map((c) => (
                      <TableCell key={c.key} className="text-right font-mono">
                        {Number(r[c.key]) > 0 ? formatCurrency(Number(r[c.key])) : "—"}
                      </TableCell>
                    ))}
                    <TableCell className="text-right font-mono font-bold">{formatCurrency(r.total)}</TableCell>
                  </TableRow>
                ))}
                <TableRow className="bg-muted/40 font-bold">
                  <TableCell>Total</TableCell>
                  <TableCell className="text-right font-mono">{formatCurrency(totals.current)}</TableCell>
                  <TableCell className="text-right font-mono">{formatCurrency(totals.d1_30)}</TableCell>
                  <TableCell className="text-right font-mono">{formatCurrency(totals.d31_60)}</TableCell>
                  <TableCell className="text-right font-mono">{formatCurrency(totals.d61_90)}</TableCell>
                  <TableCell className="text-right font-mono">{formatCurrency(totals.d90_plus)}</TableCell>
                  <TableCell className="text-right font-mono">{formatCurrency(totals.total)}</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </PageContainer>
  );
}
