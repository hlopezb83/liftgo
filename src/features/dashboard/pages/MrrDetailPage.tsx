import { DataTableV2, useLiftgoTable } from "@/components/dataTable/v2";
import { EmptyState } from "@/components/feedback/EmptyState";
import { FleetIcon } from "@/components/icons";
import { PageContainer } from "@/components/layout/PageContainer";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TableFooter, TableRow, TableCell } from "@/components/ui/table";
import { useIsTabletOrBelow } from "@/hooks/use-mobile";
import { formatCurrency } from "@/lib/format/formatCurrency";
import { MrrKpiCluster } from "../components/MrrKpiCluster";
import { MrrMobileList } from "../components/MrrMobileList";
import { useMrrColumns, type MrrItem } from "../hooks/useMrrColumns";
import { useMrrDetail } from "../hooks/useMrrDetail";

export default function MrrDetailPage() {
  const { data, isLoading } = useMrrDetail();
  const isTabletOrBelow = useIsTabletOrBelow();
  const columns = useMrrColumns();
  const items = data?.items ?? [];
  const totalMrr = data?.total_mrr ?? 0;

  const table = useLiftgoTable<MrrItem>({
    data: items,
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

      <MrrKpiCluster items={items} totalMrr={totalMrr} isLoading={isLoading} />

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Montacargas Rentados</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <MrrTableSection
            items={items}
            totalMrr={totalMrr}
            isLoading={isLoading}
            isTabletOrBelow={isTabletOrBelow}
            table={table}
          />
        </CardContent>
      </Card>
    </PageContainer>
  );
}

interface TableSectionProps {
  items: MrrItem[];
  totalMrr: number;
  isLoading: boolean;
  isTabletOrBelow: boolean;
  table: ReturnType<typeof useLiftgoTable<MrrItem>>;
}

function MrrTableSection({ items, totalMrr, isLoading, isTabletOrBelow, table }: TableSectionProps) {
  if (!isLoading && items.length === 0) {
    return (
      <div className="py-12">
        <EmptyState
          icon={FleetIcon}
          title="Sin montacargas rentados"
          subtitle="Actualmente no hay equipos con status 'rentado'."
        />
      </div>
    );
  }
  if (isTabletOrBelow) {
    return <MrrMobileList items={items} totalMrr={totalMrr} />;
  }
  const footer = items.length > 0 ? (
    <TableFooter>
      <TableRow>
        <TableCell colSpan={5} className="font-bold">Total MRR</TableCell>
        <TableCell className="text-right font-bold font-mono">
          {formatCurrency(totalMrr)}
        </TableCell>
      </TableRow>
    </TableFooter>
  ) : null;
  return (
    <DataTableV2
      table={table}
      isLoading={isLoading}
      emptyMessage="Sin montacargas rentados"
      footer={footer}
    />
  );
}
