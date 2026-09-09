
import { useState } from "react";
import {
  DataTableV2,
  useLiftgoTable,
  type ColumnDef,
} from "@/components/dataTable/v2";
import { QueryErrorState } from "@/components/feedback/QueryErrorState";
import { StatusBadge } from "@/components/feedback/StatusBadge";
import { TablePagination } from "@/components/feedback/TablePagination";
import { MobileCardList } from "@/components/layout/MobileCardList";
import { PageContainer } from "@/components/layout/PageContainer";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { CONTRACT_STATUS_LABELS } from "@/features/contracts";
import { usePortalContractsPage, type PortalContractRow } from "@/features/customers";
import { useIsMobile } from "@/hooks/use-mobile";
import { formatDateMty } from "@/lib/format/dateFormats";

type Contract = PortalContractRow;

const PAGE_SIZE = 25;

export default function PortalContracts() {
  const [page, setPage] = useState(1);
  const { data: result, isLoading, isError, refetch } = usePortalContractsPage(page, PAGE_SIZE);
  const contracts = result?.rows ?? [];
  const totalPages = Math.max(1, Math.ceil((result?.totalCount ?? 0) / PAGE_SIZE));
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
            {/* R7-FE-09b (N7-POR-05): contratos sin equipo asignado mostraban "—". */}
            {row.original.forklifts?.name
              ? `${row.original.forklifts.name} — ${row.original.forklifts.model ?? ""}`
              : "Equipo por asignar"}
          </>
        ),
      },
      {
        id: "start_date",
        accessorKey: "start_date",
        header: "Inicio",
        cell: ({ row }) => formatDateMty(row.original.start_date),
      },
      {
        id: "end_date",
        accessorKey: "end_date",
        header: "Fin",
        cell: ({ row }) => formatDateMty(row.original.end_date),
      },
      {
        id: "status",
        accessorKey: "status",
        header: "Estado",
        cell: ({ row }) => <StatusBadge status={row.original.status} label={CONTRACT_STATUS_LABELS[row.original.status]} />,
      },
    ];

  const table = useLiftgoTable<Contract>({
    data: contracts,
    columns,
    getRowId: (c) => c.id,
    initialSorting: [{ id: "start_date", desc: true }],
    enableSorting: false,
    paginated: false,
  });

  if (isLoading) return <Skeleton className="h-96" />;

  if (isError) {
    return (
      <PageContainer maxWidth="wide">
        <PageHeader title="Mis Contratos" />
        <QueryErrorState entity="tus contratos" onRetry={() => { void refetch(); }} />
      </PageContainer>
    );
  }

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
                items={contracts}
                keyExtractor={(c) => c.id}
                emptyMessage="Aún no tienes contratos. Cuando tu renta tenga un contrato aparecerá aquí."
                renderCard={(c) => (
                  <Card>
                    <CardContent className="p-3 space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium">{c.contract_number}</span>
                        <StatusBadge status={c.status} label={CONTRACT_STATUS_LABELS[c.status]} />
                      </div>
                      <div className="text-sm text-muted-foreground truncate">
                        {c.forklifts?.name ?? "Equipo por asignar"}
                        {c.forklifts?.model ? ` — ${c.forklifts.model}` : ""}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {formatDateMty(c.start_date)} → {formatDateMty(c.end_date)}
                      </div>
                    </CardContent>
                  </Card>
                )}
              />
            </div>
          ) : (
            <DataTableV2
              table={table}
              emptyMessage="Aún no tienes contratos. Cuando tu renta tenga un contrato aparecerá aquí."
            />
          )}
          <div className="border-t px-4">
            <TablePagination page={page} totalPages={totalPages} onPageChange={setPage} />
          </div>
        </CardContent>
      </Card>
    </PageContainer>
  );
}
