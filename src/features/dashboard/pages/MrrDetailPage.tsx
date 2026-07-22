import { DataTableV2, useLiftgoTable } from "@/components/dataTable/v2";
import { KpiTile } from "@/components/domain/KpiTile";
import { EmptyState } from "@/components/feedback/EmptyState";
import { RevenueIcon, FleetIcon, ChartIcon, UserIcon } from "@/components/icons";
import { PageContainer } from "@/components/layout/PageContainer";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TableFooter, TableRow, TableCell } from "@/components/ui/table";
import { useIsTabletOrBelow } from "@/hooks/use-mobile";
import { formatCurrency } from "@/lib/format/formatCurrency";
import { MrrMobileList } from "../components/MrrMobileList";
import { useMrrColumns, type MrrItem } from "../hooks/useMrrColumns";
import { useMrrDetail } from "../hooks/useMrrDetail";

export default function MrrDetailPage() {
  const { data, isLoading } = useMrrDetail();
  const isTabletOrBelow = useIsTabletOrBelow();

  const columns = useMrrColumns();

  const table = useLiftgoTable<MrrItem>({
    data: data?.items,
    columns,
    getRowId: (item) => item.forklift_id,
    initialSorting: [{ id: "monthly_rate", desc: true }],
    paginated: false,
  });

  // v7.182: KPI cluster para densidad — MRR, ARR, rentas activas y ARPU
  // (ingreso promedio por cliente activo). ARR = MRR × 12; ARPU = MRR / clientes únicos.
  const items = data?.items ?? [];
  const mrr = data?.total_mrr ?? 0;
  const activeRentals = items.length;
  const uniqueCustomers = new Set(items.map((i) => i.customer_id ?? i.customer_name ?? i.forklift_id)).size;
  const arpu = uniqueCustomers > 0 ? mrr / uniqueCustomers : 0;
  const arr = mrr * 12;

  return (
    <PageContainer>
      <PageHeader
        title="Ingreso Mensual Recurrente"
        subtitle="Detalle de montacargas actualmente rentados"
        backHref="/"
        backLabel="Panel"
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiTile
          label="MRR"
          value={isLoading ? "…" : formatCurrency(mrr)}
          icon={RevenueIcon}
          iconColor="text-success"
          iconBg="bg-success/10"
          valueSize="lg"
        />
        <KpiTile
          label="ARR"
          value={isLoading ? "…" : formatCurrency(arr)}
          icon={ChartIcon}
          iconColor="text-primary"
          iconBg="bg-primary/10"
        />
        <KpiTile
          label="Rentas activas"
          value={isLoading ? "…" : activeRentals}
          icon={FleetIcon}
          iconColor="text-info"
          iconBg="bg-info/10"
        />
        <KpiTile
          label="ARPU"
          value={isLoading ? "…" : formatCurrency(arpu)}
          icon={UserIcon}
          iconColor="text-warning"
          iconBg="bg-warning/10"
        />
      </div>


      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Montacargas Rentados</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {!isLoading && !data?.items.length ? (
            <div className="py-12">
              <EmptyState
                icon={FleetIcon}
                title="Sin montacargas rentados"
                subtitle="Actualmente no hay equipos con status 'rentado'."
              />
            </div>
          ) : isTabletOrBelow ? (
            <MrrMobileList items={data?.items ?? []} totalMrr={data?.total_mrr ?? 0} />
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
                      <TableCell className="text-right font-bold font-mono">
                        {formatCurrency(data.total_mrr)}
                      </TableCell>
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
