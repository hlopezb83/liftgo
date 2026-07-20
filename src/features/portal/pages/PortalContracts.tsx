
import {
  DataTableV2,
  DataTablePaginationV2,
  useLiftgoTable,
  type ColumnDef,
} from "@/components/dataTable/v2";
import { StatusBadge } from "@/components/feedback/StatusBadge";
import { MobileCardList } from "@/components/layout/MobileCardList";
import { PageContainer } from "@/components/layout/PageContainer";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { usePortalContracts } from "@/features/customers";
import { useIsMobile } from "@/hooks/use-mobile";

type Contract = NonNullable<ReturnType<typeof usePortalContracts>["data"]>[number];

export default function PortalContracts() {
  const { data: contracts, isLoading } = usePortalContracts();
  const isMobile = useIsMobile();

  const columns: ColumnDef<Contract>[] = [
      {
        id: "contract_number",
        accessorKey: "contract_number",
        header: "Contrato #",
        cell: ({ row }) => <span className="font-medium">{row.original.contract_number}</span>,
      },
      {
        id: "equipo",
        header: "Equipo",
        accessorFn: (c) => `${c.forklifts?.name ?? ""} ${c.forklifts?.model ?? ""}`.trim(),
        cell: ({ row }) => (
          <>
            {row.original.forklifts?.name || "—"} — {row.original.forklifts?.model || ""}
          </>
        ),
      },
      {
        id: "start_date",
        accessorKey: "start_date",
        header: "Inicio",
        cell: ({ row }) => row.original.start_date || "—",
      },
      {
        id: "end_date",
        accessorKey: "end_date",
        header: "Fin",
        cell: ({ row }) => row.original.end_date || "—",
      },
      {
        id: "status",
        accessorKey: "status",
        header: "Estado",
        cell: ({ row }) => <StatusBadge status={row.original.status} />,
      },
    ];

  const table = useLiftgoTable<Contract>({
    data: contracts,
    columns,
    getRowId: (c) => c.id,
    initialSorting: [{ id: "start_date", desc: true }],
  });

  if (isLoading) return <Skeleton className="h-96" />;

  return (
    <PageContainer maxWidth="wide">
      <PageHeader title="Mis Contratos" />
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Todos los Contratos</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isMobile ? (
            <div className="p-3">
              <MobileCardList
                items={contracts ?? []}
                keyExtractor={(c) => c.id}
                emptyMessage="No se encontraron contratos"
                renderCard={(c) => (
                  <Card>
                    <CardContent className="p-3 space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium">{c.contract_number}</span>
                        <StatusBadge status={c.status} />
                      </div>
                      <div className="text-sm text-muted-foreground truncate">
                        {c.forklifts?.name || "—"}
                        {c.forklifts?.model ? ` — ${c.forklifts.model}` : ""}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {c.start_date || "—"} → {c.end_date || "—"}
                      </div>
                    </CardContent>
                  </Card>
                )}
              />
            </div>
          ) : (
            <>
              <DataTableV2
                table={table}
                emptyMessage="No se encontraron contratos"
              />
              <div className="px-4">
                <DataTablePaginationV2 table={table} />
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </PageContainer>
  );
}
