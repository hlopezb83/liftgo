import { Link } from "react-router-dom";
import { DollarSign, ArrowLeft, ExternalLink } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { TableFooter, TableRow, TableCell } from "@/components/ui/table";
import { DataTable, type DataTableColumn } from "@/components/DataTable";
import { formatCurrency } from "@/lib/formatCurrency";
import { useMrrDetail } from "@/hooks/useMrrDetail";
import { EmptyState } from "@/components/EmptyState";
import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";

type MrrItem = NonNullable<ReturnType<typeof useMrrDetail>["data"]>["items"][number];

const fmt = (d: string | null) => (d ? format(parseISO(d), "dd MMM yyyy", { locale: es }) : "—");

export default function MrrDetailPage() {
  const { data, isLoading } = useMrrDetail();

  const columns: DataTableColumn<MrrItem>[] = [
    {
      key: "forklift_name",
      label: "Equipo",
      sortable: true,
      render: (item) => (
        <Link to={`/fleet/${item.forklift_id}`} className="font-medium text-primary hover:underline inline-flex items-center gap-1">
          {item.forklift_name}
          <ExternalLink className="h-3 w-3" />
        </Link>
      ),
    },
    {
      key: "model",
      label: "Modelo",
      sortable: true,
      accessor: (i) => `${i.manufacturer ?? ""} ${i.model ?? ""}`.trim(),
      render: (i) => [i.manufacturer, i.model].filter(Boolean).join(" ") || "—",
    },
    {
      key: "customer_name",
      label: "Cliente",
      sortable: true,
      render: (item) =>
        item.customer_id ? (
          <Link to={`/customers/${item.customer_id}`} className="text-primary hover:underline">
            {item.customer_name}
          </Link>
        ) : (
          <span className="text-muted-foreground">Sin cliente</span>
        ),
    },
    { key: "booking_number", label: "Reserva", sortable: true, render: (i) => i.booking_number ?? "—" },
    {
      key: "start_date",
      label: "Periodo",
      sortable: true,
      render: (i) => <span className="whitespace-nowrap">{fmt(i.start_date)} – {fmt(i.end_date)}</span>,
    },
    {
      key: "monthly_rate",
      label: "Tarifa Mensual",
      sortable: true,
      align: "right",
      render: (i) => <span className="font-medium font-mono">{formatCurrency(i.monthly_rate)}</span>,
    },
  ];

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
          <div className="p-3 rounded-xl bg-emerald-100 dark:bg-emerald-900/30">
            <DollarSign className="h-6 w-6 text-emerald-600 dark:text-emerald-400" />
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
            <DataTable
              columns={columns}
              data={data?.items}
              isLoading={isLoading}
              keyExtractor={(item) => item.forklift_id}
              emptyMessage="Sin montacargas rentados"
              defaultSortKey="monthly_rate"
              defaultSortDirection="desc"
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
