import { useDialogState } from "@/hooks/useDialogState";
import { useDamageRecords } from "@/hooks/useDamageRecords";
import { useDamagePhotoCounts } from "@/hooks/useDamagePhotoCounts";
import { useListFilters } from "@/hooks/useListFilters";
import { useListPage } from "@/hooks/useListPage";
import { ListPageLayout } from "@/components/ListPageLayout";
import { MobileCardList } from "@/components/MobileCardList";
import { SortableTableHead } from "@/components/SortableTableHead";
import { SearchBar } from "@/components/SearchBar";
import { StatusBadge } from "@/components/StatusBadge";
import { formatCurrency } from "@/lib/formatCurrency";
import { DamageDetailSheet } from "@/components/damage/DamageDetailSheet";
import { ReportDamageDialog } from "@/components/damage/ReportDamageDialog";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TableCell, TableHead, TableRow } from "@/components/ui/table";
import { DAMAGE_STATUSES, STATUS_LABELS } from "@/lib/constants";
import { Camera } from "lucide-react";
import { format } from "date-fns";
import type { DamageRecordWithJoins } from "@/types/rental";


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

  const { sortKey, sortDirection, toggleSort, page, setPage, totalPages, paginatedItems, isMobile } = useListPage(filtered, {
    accessors: {
      created_at: (r) => r.created_at,
      forklift_name: (r) => r.forklifts?.name || "",
      customer_name: (r) => r.customers?.name || "",
      estimated_cost: (r) => r.estimated_cost || 0,
      status: (r) => r.status,
    },
  });

  const mobileContent = isMobile ? (
    <MobileCardList
      items={paginatedItems}
      keyExtractor={(r) => r.id}
      emptyMessage="No se encontraron registros de daños"
      renderCard={(r) => (
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
  ) : undefined;

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
      items={paginatedItems}
      page={page}
      totalPages={totalPages}
      onPageChange={setPage}
      emptyMessage="No se encontraron registros de daños"
      customContent={mobileContent}
      tableHeader={
        <TableRow>
          <SortableTableHead sortKey="created_at" currentSort={sortKey} currentDirection={sortDirection} onSort={toggleSort}>Fecha</SortableTableHead>
          <SortableTableHead sortKey="forklift_name" currentSort={sortKey} currentDirection={sortDirection} onSort={toggleSort}>Montacargas</SortableTableHead>
          <SortableTableHead sortKey="customer_name" currentSort={sortKey} currentDirection={sortDirection} onSort={toggleSort}>Cliente</SortableTableHead>
          <TableHead>Descripción</TableHead>
          <TableHead className="w-16 text-center">Fotos</TableHead>
          <SortableTableHead sortKey="estimated_cost" currentSort={sortKey} currentDirection={sortDirection} onSort={toggleSort}>Costo Est.</SortableTableHead>
          <SortableTableHead sortKey="status" currentSort={sortKey} currentDirection={sortDirection} onSort={toggleSort}>Estado</SortableTableHead>
        </TableRow>
      }
      renderRow={(r) => (
          <TableRow
            key={r.id}
            className="hover:bg-muted/50 cursor-pointer"
            onClick={() => detail.open(r as DamageRecordWithJoins)}
          >
            <TableCell className="font-mono text-sm">{format(new Date(r.created_at), "dd/MM/yyyy")}</TableCell>
            <TableCell className="font-medium">{r.forklifts?.name || "—"}</TableCell>
            <TableCell>{r.customers?.name || "—"}</TableCell>
            <TableCell className="max-w-[200px] truncate">{r.description}</TableCell>
            <TableCell className="text-center">
              {getPhotoCount(r.id) > 0 ? (
                <Badge variant="secondary" className="gap-1 text-xs px-1.5 py-0">
                  <Camera className="h-3 w-3" /> {getPhotoCount(r.id)}
                </Badge>
              ) : (
                <span className="text-muted-foreground text-xs">—</span>
              )}
            </TableCell>
            <TableCell className="font-mono">{formatCurrency(r.estimated_cost)}</TableCell>
            <TableCell><StatusBadge status={r.status} /></TableCell>
          </TableRow>
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
