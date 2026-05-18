import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/StatusBadge";
import { usePortalContracts } from "@/features/customers/hooks/customers/useCustomerPortal";
import { Skeleton } from "@/components/ui/skeleton";
import { DataTable, type DataTableColumn } from "@/components/DataTable";

type Contract = NonNullable<ReturnType<typeof usePortalContracts>["data"]>[number];

export default function PortalContracts() {
  const { data: contracts, isLoading } = usePortalContracts();

  if (isLoading) return <Skeleton className="h-96" />;

  const columns: DataTableColumn<Contract>[] = [
    { key: "contract_number", label: "Contrato #", sortable: true, render: (c) => <span className="font-medium">{c.contract_number}</span> },
    {
      key: "equipo",
      label: "Equipo",
      sortable: true,
      accessor: (c) => `${c.forklifts?.name ?? ""} ${c.forklifts?.model ?? ""}`.trim(),
      render: (c) => <>{c.forklifts?.name || "—"} — {c.forklifts?.model || ""}</>,
    },
    { key: "start_date", label: "Inicio", sortable: true, render: (c) => c.start_date || "—" },
    { key: "end_date", label: "Fin", sortable: true, render: (c) => c.end_date || "—" },
    { key: "status", label: "Estado", sortable: true, render: (c) => <StatusBadge status={c.status} /> },
  ];

  return (
    <div className="space-y-6 max-w-5xl">
      <h1 className="text-2xl font-bold">Mis Contratos</h1>
      <Card>
        <CardHeader><CardTitle className="text-base">Todos los Contratos</CardTitle></CardHeader>
        <CardContent className="p-0">
          <DataTable
            columns={columns}
            data={contracts}
            keyExtractor={(c) => c.id}
            emptyMessage="No se encontraron contratos"
            defaultSortKey="start_date"
            defaultSortDirection="desc"
          />
        </CardContent>
      </Card>
    </div>
  );
}
