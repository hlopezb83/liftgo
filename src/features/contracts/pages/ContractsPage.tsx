import { useNavigateTransition } from "@/hooks/useNavigateTransition";

import { STATUS_LABELS } from "@/lib/constants";
import { useContracts, contractQueries } from "../hooks/useContracts";
import { useListFilters } from "@/hooks/useListFilters";
import { ListPageLayout } from "@/components/layout/ListPageLayout";
import { SearchBar } from "@/components/forms/SearchBar";
import { StatusBadge } from "@/components/feedback/StatusBadge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { AddIcon, ViewIcon, ChevronRightIcon } from "@/components/icons";
import { formatDateDisplay, formatDateRange } from "@/lib/utils";
import { useLiftgoTable, type ColumnDef } from "@/components/dataTable/v2";

const STATUSES = ["all", "draft", "sent", "signed", "cancelled"] as const;

type Contract = NonNullable<ReturnType<typeof useContracts>["data"]>[number];

export default function ContractsPage() {
  const { data: contracts, isLoading } = useContracts();
  const navigate = useNavigateTransition();

  const { search, setSearch, statusFilter, setStatusFilter, filtered } = useListFilters(contracts, {
    searchFields: ["contract_number", "customer_name"],
    statusField: "status",
  });

  const columns: ColumnDef<Contract>[] = [
      {
        id: "contract_number",
        header: "Contrato #",
        accessorKey: "contract_number",
        cell: ({ row }) => <span className="font-medium">{row.original.contract_number}</span>,
      },
      {
        id: "customer_name",
        header: "Cliente",
        accessorFn: (c) => c.customer_name || "",
        cell: ({ row }) => row.original.customer_name || "—",
      },
      {
        id: "forklift_name",
        header: "Equipo",
        accessorFn: (c) => c.forklift_name || "",
        cell: ({ row }) => row.original.forklift_name || "—",
      },
      {
        id: "start_date",
        header: "Inicio",
        accessorFn: (c) => c.start_date || "",
        cell: ({ row }) => <span className="text-sm text-muted-foreground">{formatDateDisplay(row.original.start_date)}</span>,
      },
      {
        id: "end_date",
        header: "Fin",
        accessorFn: (c) => c.end_date || "",
        cell: ({ row }) => <span className="text-sm text-muted-foreground">{formatDateDisplay(row.original.end_date)}</span>,
      },
      {
        id: "status",
        header: "Estado",
        accessorKey: "status",
        cell: ({ row }) => <StatusBadge status={row.original.status} />,
      },
      {
        id: "view",
        header: "",
        enableSorting: false,
        meta: { cellClassName: "w-12" },
        cell: () => <ViewIcon className="h-4 w-4 text-muted-foreground" />,
      },
    ];

  const table = useLiftgoTable<Contract>({
    data: filtered,
    columns,
    getRowId: (c) => c.id,
  });

  return (
    <ListPageLayout
      title="Contratos"
      subtitle="Administrar contratos de renta"
      actions={<Button size="sm" onClick={() => navigate("/contracts/new")}><AddIcon className="h-4 w-4 mr-1" />Nuevo Contrato</Button>}
      filters={
        <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
          <Tabs value={statusFilter} onValueChange={setStatusFilter}>
            <TabsList className="flex-nowrap overflow-x-auto w-full sm:w-auto">
              {STATUSES.map((s) => <TabsTrigger key={s} value={s}>{STATUS_LABELS[s] || s}</TabsTrigger>)}
            </TabsList>
          </Tabs>
          <SearchBar value={search} onChange={setSearch} placeholder="Buscar contratos…" className="w-full sm:w-64" />
        </div>
      }
      isLoading={isLoading}
      table={table}
      onRowClick={(c) => navigate(`/contracts/${c.id}`)}
      emptyMessage="No se encontraron contratos"
      skeletonColumns={7}
      mobileCardRender={(c) => (
        <Card className="cursor-pointer active:scale-[0.98] transition-transform" onClick={() => navigate(`/contracts/${c.id}`)}>
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-1">
              <span className="font-mono font-semibold text-sm">{c.contract_number}</span>
              <StatusBadge status={c.status} />
            </div>
            <p className="text-sm text-muted-foreground">{c.customer_name || "Sin cliente"}</p>
            {c.forklift_name && <p className="text-xs text-muted-foreground mt-1">Equipo: {c.forklift_name}</p>}
            <div className="flex items-center justify-between mt-3 pt-3 border-t">
              <span className="text-xs text-muted-foreground">
                {formatDateRange(c.start_date, c.end_date)}
              </span>
              <ChevronRightIcon className="h-4 w-4 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>
      )}
    />
  );
}
