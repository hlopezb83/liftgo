
import { Link } from "react-router";
import { DataTableV2, useLiftgoTable, type ColumnDef } from "@/components/dataTable/v2";
import { KpiTile } from "@/components/domain/KpiTile";
import { EmptyState } from "@/components/feedback/EmptyState";
import { RevenueIcon, FleetIcon, OpenLinkIcon } from "@/components/icons";
import { MobileCardList } from "@/components/layout/MobileCardList";
import { PageContainer } from "@/components/layout/PageContainer";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TableFooter, TableRow, TableCell } from "@/components/ui/table";
import { useIsTabletOrBelow } from "@/hooks/use-mobile";
import { APP_LOCALE } from "@/lib/format/dateFormats";
import { formatCurrency } from "@/lib/format/formatCurrency";
import { formatMtyDate } from "@/lib/utils";
import { useMrrDetail } from "../hooks/useMrrDetail";

type MrrItem = NonNullable<ReturnType<typeof useMrrDetail>["data"]>["items"][number];

const fmt = (d: string | null) => formatMtyDate(d, "dd MMM yyyy", APP_LOCALE);

export default function MrrDetailPage() {
  const { data, isLoading } = useMrrDetail();
  const isTabletOrBelow = useIsTabletOrBelow();

  const columns: ColumnDef<MrrItem>[] = [
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
            <OpenLinkIcon className="h-3 w-3" />
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
    ];

  const table = useLiftgoTable<MrrItem>({
    data: data?.items,
    columns,
    getRowId: (item) => item.forklift_id,
    initialSorting: [{ id: "monthly_rate", desc: true }],
    paginated: false,
  });

  return (
    <PageContainer>
      <PageHeader
        title="Ingreso Mensual Recurrente"
        subtitle="Detalle de montacargas actualmente rentados"
        backHref="/"
        backLabel="Panel"
      />

      <KpiTile
        label="MRR Total"
        value={isLoading ? "…" : formatCurrency(data?.total_mrr ?? 0)}
        icon={RevenueIcon}
        iconColor="text-success"
        iconBg="bg-success/10"
        valueSize="lg"
      />

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Montacargas Rentados</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {!isLoading && !data?.items.length ? (
            <div className="py-12">
              <EmptyState icon={FleetIcon} title="Sin montacargas rentados" subtitle="Actualmente no hay equipos con status 'rentado'." />
            </div>
          ) : isTabletOrBelow ? (
            <div className="p-3 space-y-3">
              <MobileCardList
                items={data?.items ?? []}
                keyExtractor={(item) => item.forklift_id}
                emptyMessage="Sin montacargas rentados"
                renderCard={(item) => (
                  <Card className="cursor-pointer">
                    <CardContent className="p-4 space-y-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <Link
                          to={`/fleet/${item.forklift_id}`}
                          className="font-medium text-primary hover:underline inline-flex items-center gap-1 truncate"
                        >
                          {item.forklift_name}
                          <OpenLinkIcon className="h-3 w-3 shrink-0" />
                        </Link>
                        <span className="text-sm font-semibold font-mono whitespace-nowrap">
                          {formatCurrency(item.monthly_rate)}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground truncate">
                        {[item.manufacturer, item.model].filter(Boolean).join(" ") || "—"}
                      </p>
                      <p className="text-xs">
                        {item.customer_id ? (
                          <Link to={`/customers/${item.customer_id}`} className="text-primary hover:underline">
                            {item.customer_name}
                          </Link>
                        ) : (
                          <span className="text-muted-foreground">Sin cliente</span>
                        )}
                        {item.booking_number ? <span className="text-muted-foreground"> · {item.booking_number}</span> : null}
                      </p>
                      <p className="text-xs text-muted-foreground whitespace-nowrap">
                        {fmt(item.start_date)} – {fmt(item.end_date)}
                      </p>
                    </CardContent>
                  </Card>
                )}
              />
              {data && data.items.length > 0 && (
                <div className="flex items-center justify-between border-t pt-3 px-1">
                  <span className="text-sm font-bold">Total MRR</span>
                  <span className="text-sm font-bold font-mono">{formatCurrency(data.total_mrr)}</span>
                </div>
              )}
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
    </PageContainer>
  );
}
