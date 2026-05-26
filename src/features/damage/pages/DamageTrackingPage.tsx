import { useDialogState } from "@/hooks/useDialogState";
import { useMemo } from "react";
import { useDamageRecords } from "@/features/damage/hooks/useDamageRecords";
import { useDamagePhotoCounts } from "@/features/damage/hooks/useDamagePhotoCounts";
import { useListFilters } from "@/hooks/useListFilters";
import { ListPageLayout } from "@/components/ListPageLayout";
import { SearchBar } from "@/components/SearchBar";
import { StatusBadge } from "@/components/StatusBadge";
import { formatCurrency } from "@/lib/formatCurrency";
import { DamageDetailSheet } from "@/features/damage/components/damage/DamageDetailSheet";
import { ReportDamageDialog } from "@/features/damage/components/damage/ReportDamageDialog";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DAMAGE_STATUSES, STATUS_LABELS } from "@/lib/constants";
import { Camera } from "lucide-react";
import { format } from "date-fns";
import type { DamageRecordWithJoins } from "@/types/rental";
import { useLiftgoTable, type ColumnDef } from "@/components/dataTable/v2";

type DamageRow = NonNullable<ReturnType<typeof useDamageRecords>["data"]>[number];

export default function DamageTrackingPage() {
  const { data: records, isLoading } = useDamageRecords();
  const { data: photoCounts } = useDamagePhotoCounts();
  const detail = useDialogState<DamageRecordWithJoins>();

  const getPhotoCount = (id: string) => photoCounts?.[id] || 0;

  const { search, setSearch, statusFilter, setStatusFilter, filtered } = useListFilters(records, {
    searchFields: ["description"],
    searchAccessors: [
      (r) => r.forklifts?.name,
      (r) => r.customers?.name,
    ],
    statusField: "status",
  });

  const columns = useMemo<ColumnDef<DamageRow>[]>(
    () => [
      {
        id: "created_at",
        header: "Fecha",
        accessorKey: "created_at",
        cell: ({ row }) => <span className="font-mono text-sm">{format(new Date(row.original.created_at), "dd/MM/yyyy")}</span>,
      },
      {
        id: "forklift_name",
        header: "Montacargas",
        accessorFn: (r) => r.forklifts?.name || "",
        cell: ({ row }) => <span className="font-medium">{row.original.forklifts?.name || "—"}</span>,
      },
      {
        id: "customer_name",
        header: "Cliente",
        accessorFn: (r) => r.customers?.name || "",
        cell: ({ row }) => row.original.customers?.name || "—",
      },
      {
        id: "description",
        header: "Descripción",
        enableSorting: false,
        meta: { cellClassName: "max-w-[200px] truncate" },
        cell: ({ row }) => row.original.description,
      },
      {
        id: "photos",
        header: "Fotos",
        enableSorting: false,
        meta: { align: "center", cellClassName: "w-16" },
        cell: ({ row }) =>
          getPhotoCount(row.original.id) > 0 ? (
            <Badge variant="secondary" className="gap-1 text-xs px-1.5 py-0">
              <Camera className="h-3 w-3" /> {getPhotoCount(row.original.id)}
            </Badge>
          ) : (
            <span className="text-muted-foreground text-xs">—</span>
          ),
      },
      {
        id: "estimated_cost",
        header: "Costo Est.",
        accessorFn: (r) => r.estimated_cost || 0,
        cell: ({ row }) => <span className="font-mono">{formatCurrency(row.original.estimated_cost)}</span>,
      },
      {
        id: "status",
        header: "Estado",
        accessorKey: "status",
        cell: ({ row }) => <StatusBadge status={row.original.status} />,
      },
    ],
    [photoCounts],
  );

  const table = useLiftgoTable<DamageRow>({
    data: filtered,
    columns,
    getRowId: (r) => r.id,
  });

  return (
    <>
      <ListPageLayout
        title="Seguimiento de Daños"
        subtitle="Rastrea daños desde inspecciones hasta reparación y facturación"
        actions={<ReportDamageDialog />}
        filters={
          <div className="flex flex-col sm:flex-row gap-3">
            <SearchBar value={search} onChange={setSearch} placeholder="Buscar por descripción, montacargas..." />
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full sm:w-[160px]"><SelectValue placeholder="Todos los estados" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos los estados</SelectItem>
                {DAMAGE_STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>{STATUS_LABELS[s] || s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        }
        isLoading={isLoading}
        table={table}
        onRowClick={(r) => detail.open(r as DamageRecordWithJoins)}
        emptyMessage="No se encontraron registros de daños"
        mobileCardRender={(r) => (
          <Card className="cursor-pointer" onClick={() => detail.open(r as DamageRecordWithJoins)}>
            <CardContent className="p-4 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-sm">{format(new Date(r.created_at), "dd/MM/yyyy")}</span>
                  {getPhotoCount(r.id) > 0 && (
                    <Badge variant="secondary" className="gap-1 text-xs px-1.5 py-0">
                      <Camera className="h-3 w-3" /> {getPhotoCount(r.id)}
                    </Badge>
                  )}
                </div>
                <StatusBadge status={r.status} />
              </div>
              <p className="text-sm font-medium">{r.forklifts?.name || "—"}</p>
              <p className="text-sm text-muted-foreground">{r.customers?.name || "—"}</p>
              <p className="text-sm text-muted-foreground truncate">{r.description}</p>
              <span className="font-mono text-sm">{formatCurrency(r.estimated_cost)}</span>
            </CardContent>
          </Card>
        )}
      />

      <DamageDetailSheet
        record={detail.selected}
        open={detail.isOpen}
        onOpenChange={detail.onOpenChange}
      />
    </>
  );
}
