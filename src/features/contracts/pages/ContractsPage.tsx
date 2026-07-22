import { useLiftgoTable, type ColumnDef } from "@/components/dataTable/v2";
import { StatusBadge } from "@/components/feedback/StatusBadge";
import { FiltersToolbar } from "@/components/filters/FiltersToolbar";
import { AddIcon, ViewIcon, ChevronRightIcon } from "@/components/icons";
import { ListPageLayout } from "@/components/layout/ListPageLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useTableFilters } from "@/hooks/filters/useTableFilters";
import { useNavigateTransition } from "@/hooks/useNavigateTransition";
import { STATUS_LABELS } from "@/lib/constants";
import { formatDateDisplay, formatDateRange } from "@/lib/utils";
import { getContractExpiryLabel, getContractExpiryState } from "../lib/contractExpiry";
import { useContracts, contractQueries } from "../hooks/useContracts";

const CONTRACT_STATUSES = ["draft", "sent", "signed", "cancelled"] as const;
type ContractStatus = (typeof CONTRACT_STATUSES)[number];
const CONTRACT_STATUS_OPTIONS = [
  { value: "all" as const, label: STATUS_LABELS.all ?? "Todos" },
  ...CONTRACT_STATUSES.map((s) => ({ value: s, label: STATUS_LABELS[s] ?? s })),
];

type Contract = NonNullable<ReturnType<typeof useContracts>["data"]>[number];

export default function ContractsPage() {
  const { data: contracts, isLoading, isError, refetch } = useContracts();
  const navigate = useNavigateTransition();

  const { values, set, reset, hasActive, filtered } = useTableFilters<Contract, {
    q: { type: "text"; fields: (keyof Contract)[] };
    status: { type: "enum"; field: keyof Contract; options: readonly (ContractStatus | "all")[] };
  }>({
    items: contracts ?? [],
    facets: {
      q: { type: "text", fields: ["contract_number", "customer_name"] as (keyof Contract)[] },
      status: { type: "enum", field: "status", options: ["all", ...CONTRACT_STATUSES] as const },
    },
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
        cell: ({ row }) => {
          const expiry = getContractExpiryState(row.original.end_date, row.original.status);
          const label = getContractExpiryLabel(expiry);
          return (
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">{formatDateDisplay(row.original.end_date)}</span>
              {label && (
                <Badge
                  variant={expiry === "expired" ? "destructive" : "outline"}
                  className={expiry === "expiring_soon" ? "border-amber-500 text-amber-700 dark:text-amber-400" : ""}
                >
                  {label}
                </Badge>
              )}
            </div>
          );
        },
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
        <FiltersToolbar>
          <FiltersToolbar.Search
            value={values.q}
            onChange={(v) => set("q", v)}
            placeholder="Buscar contratos…"
          />
          <FiltersToolbar.StatusTabs
            value={values.status}
            onChange={(v) => set("status", v as ContractStatus | "all")}
            options={CONTRACT_STATUS_OPTIONS}
          />
          <FiltersToolbar.ClearAll visible={hasActive} onClick={reset} />
        </FiltersToolbar>
      }

      isLoading={isLoading}
      isError={isError}
      onRetry={() => { void refetch(); }}
      table={table}
      onRowClick={(c) => navigate(`/contracts/${c.id}`)}
      onRowPrefetch={(c) => contractQueries.detail(c.id)}
      hasActiveFilters={hasActive}
      onClearFilters={reset}
      emptyMessage="No se encontraron contratos"
      skeletonColumns={7}
      mobileCardRender={(c) => {
        const expiry = getContractExpiryState(c.end_date, c.status);
        const expiryLabel = getContractExpiryLabel(expiry);
        return (
          <Card className="cursor-pointer active:scale-[0.98] transition-transform" onClick={() => navigate(`/contracts/${c.id}`)}>
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-1">
                <span className="font-mono font-semibold text-sm">{c.contract_number}</span>
                <div className="flex items-center gap-1.5">
                  {expiryLabel && (
                    <Badge
                      variant={expiry === "expired" ? "destructive" : "outline"}
                      className={expiry === "expiring_soon" ? "border-amber-500 text-amber-700 dark:text-amber-400" : ""}
                    >
                      {expiryLabel}
                    </Badge>
                  )}
                  <StatusBadge status={c.status} />
                </div>
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
        );
      }}
    />
  );
}
