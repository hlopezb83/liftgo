import { useMemo } from "react";
import { Link } from "react-router-dom";
import { DollarSign, ArrowLeft, ExternalLink } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { TableFooter, TableRow, TableCell } from "@/components/ui/table";
import { DataTableV2, useLiftgoTable, type ColumnDef } from "@/components/dataTable/v2";
import { formatCurrency } from "@/lib/format/formatCurrency";
import { useMrrDetail } from "../hooks/useMrrDetail";
import { EmptyState } from "@/components/feedback/EmptyState";
import { es } from "date-fns/locale";
import { formatMtyDate } from "@/lib/utils";

type MrrItem = NonNullable<ReturnType<typeof useMrrDetail>["data"]>["items"][number];

const fmt = (d: string | null) => formatMtyDate(d, "dd MMM yyyy", es);

export default function MrrDetailPage() {
  const { data, isLoading } = useMrrDetail();

  const columns = useMemo<ColumnDef<MrrItem>[]>(
    () => [
      {
        id: "forklift_name",
        header: "Equipo",
        accessorKey: "forklift_name",
        cell: ({ row }) => (
          <Link
            to={`/fleet/${row.original.forklift_id}`}
            className="font-medium text-primary hover:underline inline-flex items-center gap-1"
          >
            {row.original.forklift_name}
            <ExternalLink className="h-3 w-3" />
          </Link>
        ),
      },
      {
        id: "model",
        header: "Modelo",
        accessorFn: (i) => `${i.manufacturer ?? ""} ${i.model ?? ""}`.trim(),
        cell: ({ row }) =>
          [row.original.manufacturer, row.original.model].filter(Boolean).join(" ") || "—",
      },
      {
        id: "customer_name",
        header: "Cliente",
        accessorKey: "customer_name",
        cell: ({ row }) =>
          row.original.customer_id ? (
            <Link to={`/customers/${row.original.customer_id}`} className="text-primary hover:underline">
              {row.original.customer_name}
            </Link>
          ) : (
            <span className="text-muted-foreground">Sin cliente</span>
          ),
      },
      {
        id: "booking_number",
        header: "Reserva",
        accessorKey: "booking_number",
        cell: ({ row }) => row.original.booking_number ?? "—",
      },
      {
        id: "start_date",
        header: "Periodo",
        accessorKey: "start_date",
        cell: ({ row }) => (
          <span className="whitespace-nowrap">
            {fmt(row.original.start_date)} – {fmt(row.original.end_date)}
          </span>
        ),
      },
      {
        id: "monthly_rate",
        header: "Tarifa Mensual",
        accessorKey: "monthly_rate",
        meta: { align: "right" },
        cell: ({ row }) => (
          <span className="font-medium font-mono">{formatCurrency(row.original.monthly_rate)}</span>
        ),
      },
    ],
    [],
  );

  const table = useLiftgoTable<MrrItem>({
    data: data?.items,
    columns,
    getRowId: (item) => item.forklift_id,
    initialSorting: [{ id: "monthly_rate", desc: true }],
    paginated: false,
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" asChild>
          <Link to="/"><ArrowLeft className="h-5 w-5" /></Link>
        </Button>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Ingreso Mensual Recurrente</h1>
          <p className="text-muted-foreground text-sm">Detalle de montacargas actualmente rentados</p>
        </div>
      </div>

      <Card>
        <CardContent className="p-5 flex items-center gap-4">
          <div className="p-3 rounded-xl bg-success/10">
            <DollarSign className="h-6 w-6 text-success" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground">MRR Total</p>
            <p className="text-2xl font-bold">{isLoading ? "…" : formatCurrency(data?.total_mrr ?? 0)}</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Montacargas Rentados</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {!isLoading && !data?.items.length ? (
            <div className="p-8">
              <EmptyState icon={DollarSign} title="Sin montacargas rentados" subtitle="Actualmente no hay equipos con status 'rentado'." />
            </div>
          ) : (
            <DataTableV2
              table={table}
              isLoading={isLoading}
              emptyMessage="Sin montacargas rentados"
              footer={
                data && data.items.length > 0 ? (
                  <TableFooter>
                    <TableRow>
                      <TableCell colSpan={5} className="font-bold">Total MRR</TableCell>
                      <TableCell className="text-right font-bold font-mono">{formatCurrency(data.total_mrr)}</TableCell>
                    </TableRow>
                  </TableFooter>
                ) : null
              }
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
