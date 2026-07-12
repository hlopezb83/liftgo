import { useLiftgoTable, type ColumnDef } from "@/components/dataTable/v2";
import { StatusBadge } from "@/components/feedback/StatusBadge";
import { SearchBar } from "@/components/forms/SearchBar";
import { Camera } from "@/components/icons";
import { ListPageLayout } from "@/components/layout/ListPageLayout";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useDialogState } from "@/hooks/useDialogState";
import { useListFilters } from "@/hooks/useListFilters";
import { DAMAGE_STATUSES, STATUS_LABELS } from "@/lib/constants";
import { formatDateMty } from "@/lib/format/dateFormats";
import { formatCurrency } from "@/lib/format/formatCurrency";
import type { DamageRecordWithJoins } from "@/types/rental";
import { DamageDetailSheet } from "../components/damage/DamageDetailSheet";
import { ReportDamageDialog } from "../components/damage/ReportDamageDialog";
import { useDamagePhotoCounts } from "../hooks/useDamagePhotoCounts";
import { useDamageRecords } from "../hooks/useDamageRecords";

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

  const columns: ColumnDef<DamageRow>[] = [
      {
        id: "created_at",
        header: "Fecha",
        accessorKey: "created_at",
        cell: ({ row }) => <span className="font-mono text-sm">{formatDateMty(row.original.created_at)}</span>,
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
        cell: ({ row }) => {
          const count = photoCounts?.[row.original.id] || 0;
          return count > 0 ? (
            <Badge variant="secondary" className="gap-1 text-xs px-1.5 py-0">
              <Camera className="h-3 w-3" /> {count}
            </Badge>
          ) : (
            <span className="text-muted-foreground text-xs">—</span>
          );
        },
      },
      {
        id: "estimated_cost",
        header: "Costo Est.",
        accessorFn: (r) => r.estimated_cost || 0,
        cell: ({ row }) => <span className="font-mono">{formatCurrency(row.original.estimated_cost ?? 0)}</span>,
      },
      {
        id: "status",
        header: "Estado",
        accessorKey: "status",
        cell: ({ row }) => <StatusBadge status={row.original.status} />,
      },
    ];

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
                  <span className="font-mono text-sm">{formatDateMty(r.created_at)}</span>
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
              <span className="font-mono text-sm">{formatCurrency(r.estimated_cost ?? 0)}</span>
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
