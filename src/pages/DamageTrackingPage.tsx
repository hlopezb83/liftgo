import { useState } from "react";
import { useDamageRecords } from "@/hooks/useDamageRecords";
import { useListFilters } from "@/hooks/useListFilters";
import { usePagination } from "@/hooks/usePagination";
import { useSort } from "@/hooks/useSort";
import { useIsMobile } from "@/hooks/use-mobile";
import { ListPageLayout } from "@/components/ListPageLayout";
import { MobileCardList } from "@/components/MobileCardList";
import { SortableTableHead } from "@/components/SortableTableHead";
import { SearchBar } from "@/components/SearchBar";
import { StatusBadge } from "@/components/StatusBadge";
import { formatCurrency } from "@/lib/formatCurrency";
import { DamageActions } from "@/components/DamageActions";
import { DamagePhotosSection } from "@/components/DamagePhotosSection";
import { ReportDamageDialog } from "@/components/ReportDamageDialog";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TableCell, TableHead, TableRow } from "@/components/ui/table";
import { DAMAGE_STATUSES, STATUS_LABELS } from "@/lib/constants";
import { ChevronDown, ChevronRight } from "lucide-react";
import { format } from "date-fns";


export default function DamageTrackingPage() {
  const { data: records, isLoading } = useDamageRecords();
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const { search, setSearch, statusFilter, setStatusFilter, filtered } = useListFilters(records, {
    searchFields: ["description"],
    statusField: "status",
  });

  const extraFiltered = filtered?.filter((r) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      r.description.toLowerCase().includes(q) ||
      (r.forklifts?.name || "").toLowerCase().includes(q) ||
      (r.customers?.name || "").toLowerCase().includes(q)
    );
  });

  const { sortKey, sortDirection, toggleSort, sortedItems } = useSort(extraFiltered, {
    accessors: {
      created_at: (r) => r.created_at,
      forklift_name: (r) => r.forklifts?.name || "",
      customer_name: (r) => r.customers?.name || "",
      estimated_cost: (r) => r.estimated_cost || 0,
      status: (r) => r.status,
    },
  });

  const { page, setPage, totalPages, paginatedItems } = usePagination(sortedItems);
  const isMobile = useIsMobile();

  const toggleExpand = (id: string) => setExpandedId((prev) => (prev === id ? null : id));

  const mobileContent = isMobile ? (
    <MobileCardList
      items={paginatedItems}
      keyExtractor={(r) => r.id}
      emptyMessage="No se encontraron registros de daños"
      renderCard={(r) => (
        <Card>
          <CardContent className="p-4 space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-mono text-sm">{format(new Date(r.created_at), "dd/MM/yyyy")}</span>
              <StatusBadge status={r.status} />
            </div>
            <p className="text-sm font-medium">{r.forklifts?.name || "—"}</p>
            <p className="text-sm text-muted-foreground">{r.customers?.name || "—"}</p>
            <p className="text-sm text-muted-foreground truncate">{r.description}</p>
            <div className="flex items-center justify-between pt-1">
              <span className="font-mono text-sm">{formatCurrency(r.estimated_cost)}</span>
              <DamageActions record={r} />
            </div>
            <button
              type="button"
              onClick={() => toggleExpand(r.id)}
              className="w-full text-xs text-primary flex items-center gap-1 pt-1"
            >
              {expandedId === r.id ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
              {expandedId === r.id ? "Ocultar fotos" : "Ver / subir fotos"}
            </button>
            {expandedId === r.id && (
              <div className="pt-2">
                <DamagePhotosSection entityType="damage_record" entityId={r.id} title="Fotos" />
              </div>
            )}
          </CardContent>
        </Card>
      )}
    />
  ) : undefined;

  return (
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
          <TableHead className="w-8" />
          <SortableTableHead sortKey="created_at" currentSort={sortKey} currentDirection={sortDirection} onSort={toggleSort}>Fecha</SortableTableHead>
          <SortableTableHead sortKey="forklift_name" currentSort={sortKey} currentDirection={sortDirection} onSort={toggleSort}>Montacargas</SortableTableHead>
          <SortableTableHead sortKey="customer_name" currentSort={sortKey} currentDirection={sortDirection} onSort={toggleSort}>Cliente</SortableTableHead>
          <TableHead>Descripción</TableHead>
          <SortableTableHead sortKey="estimated_cost" currentSort={sortKey} currentDirection={sortDirection} onSort={toggleSort}>Costo Est.</SortableTableHead>
          <SortableTableHead sortKey="status" currentSort={sortKey} currentDirection={sortDirection} onSort={toggleSort}>Estado</SortableTableHead>
          <TableHead>Acciones</TableHead>
        </TableRow>
      }
      renderRow={(r) => (
        <>
          <TableRow
            key={r.id}
            className="hover:bg-muted/50 border-l-2 border-transparent hover:border-primary transition-colors cursor-pointer"
            onClick={() => toggleExpand(r.id)}
          >
            <TableCell className="w-8 px-2">
              {expandedId === r.id
                ? <ChevronDown className="h-4 w-4 text-muted-foreground" />
                : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
            </TableCell>
            <TableCell className="font-mono text-sm">{format(new Date(r.created_at), "dd/MM/yyyy")}</TableCell>
            <TableCell className="font-medium">{r.forklifts?.name || "—"}</TableCell>
            <TableCell>{r.customers?.name || "—"}</TableCell>
            <TableCell className="max-w-[200px] truncate">{r.description}</TableCell>
            <TableCell className="font-mono">{formatCurrency(r.estimated_cost)}</TableCell>
            <TableCell><StatusBadge status={r.status} /></TableCell>
            <TableCell onClick={(e) => e.stopPropagation()}><DamageActions record={r} /></TableCell>
          </TableRow>
          {expandedId === r.id && (
            <TableRow key={`${r.id}-photos`}>
              <TableCell colSpan={8} className="p-4 bg-muted/20">
                <DamagePhotosSection entityType="damage_record" entityId={r.id} title="Fotos de Daño" />
              </TableCell>
            </TableRow>
          )}
        </>
      )}
    />
  );
}
