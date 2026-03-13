import { useNavigate } from "react-router-dom";
import { format, differenceInDays, parseISO } from "date-fns";

import { STATUS_LABELS } from "@/lib/constants";
import { useBookings } from "@/hooks/useBookings";
import { useListFilters } from "@/hooks/useListFilters";
import { useListPage } from "@/hooks/useListPage";
import { ListPageLayout } from "@/components/ListPageLayout";
import { MobileCardList } from "@/components/MobileCardList";
import { SortableTableHead } from "@/components/SortableTableHead";
import { SearchBar } from "@/components/SearchBar";
import { StatusBadge } from "@/components/StatusBadge";
import { BookingActions } from "@/components/bookings/BookingActions";
import { RecurringBillingBadge } from "@/components/bookings/RecurringBillingBadge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { TableRow, TableCell, TableHead } from "@/components/ui/table";
import { Plus, ChevronRight, CalendarDays } from "lucide-react";

const STATUSES = ["all", "confirmed", "completed", "cancelled"] as const;

export default function BookingsPage() {
  const { data: bookings, isLoading } = useBookings();
  const navigate = useNavigate();

  const { search, setSearch, statusFilter, setStatusFilter, filtered } = useListFilters(bookings, {
    searchFields: ["customer_name"],
    statusField: "status",
  });

  const { sortKey, sortDirection, toggleSort, page, setPage, totalPages, totalItems, paginatedItems, isMobile } = useListPage(filtered, {
    accessors: {
      forklift_name: (b) => b.forklifts?.name || "",
      customer_name: (b) => b.customer_name || "",
      start_date: (b) => b.start_date,
      end_date: (b) => b.end_date,
      status: (b) => b.status,
    },
  });

  const getDuration = (start: string, end: string) => {
    const days = differenceInDays(parseISO(end), parseISO(start));
    return `${days} día${days !== 1 ? "s" : ""}`;
  };

  const formatDate = (d: string) => format(parseISO(d), "dd/MM/yyyy");

  const mobileContent = isMobile ? (
    <MobileCardList
      items={paginatedItems}
      keyExtractor={(b) => b.id}
      emptyMessage="No se encontraron reservas"
      renderCard={(b) => (
        <Card className="cursor-pointer active:scale-[0.98] transition-transform">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-1">
              <span className="font-semibold text-sm">{b.forklifts?.name || "—"}</span>
              <StatusBadge status={b.status} />
            </div>
            <p className="text-sm text-muted-foreground">{b.customer_name || "Sin cliente"}</p>
            <div className="flex items-center gap-2 mt-1">
              <RecurringBillingBadge booking={b} />
            </div>
            <div className="flex items-center justify-between mt-3 pt-3 border-t">
              <span className="text-xs text-muted-foreground">
                {formatDate(b.start_date)} → {formatDate(b.end_date)} · {getDuration(b.start_date, b.end_date)}
              </span>
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>
      )}
    />
  ) : undefined;

  return (
    <ListPageLayout
      title="Reservas"
      subtitle="Administrar reservas de equipos"
      totalCount={totalItems}
      actions={<Button size="sm" onClick={() => navigate("/bookings/new")}><Plus className="h-4 w-4 mr-1" />Nueva Reserva</Button>}
      filters={
        <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
          <Tabs value={statusFilter} onValueChange={setStatusFilter}>
            <TabsList className="flex-nowrap overflow-x-auto w-full sm:w-auto">
              {STATUSES.map((s) => <TabsTrigger key={s} value={s}>{STATUS_LABELS[s] || s}</TabsTrigger>)}
            </TabsList>
          </Tabs>
          <SearchBar value={search} onChange={setSearch} placeholder="Buscar por cliente…" className="w-full sm:w-64" />
        </div>
      }
      isLoading={isLoading}
      items={paginatedItems}
      page={page}
      totalPages={totalPages}
      onPageChange={setPage}
      emptyMessage="No se encontraron reservas"
      emptyIcon={CalendarDays}
      emptyActionLabel="Nueva Reserva"
      onEmptyAction={() => navigate("/bookings/new")}
      tableHeader={
        <TableRow>
          <SortableTableHead sortKey="forklift_name" currentSort={sortKey} currentDirection={sortDirection} onSort={toggleSort}>Equipo</SortableTableHead>
          <SortableTableHead sortKey="customer_name" currentSort={sortKey} currentDirection={sortDirection} onSort={toggleSort}>Cliente</SortableTableHead>
          <SortableTableHead sortKey="start_date" currentSort={sortKey} currentDirection={sortDirection} onSort={toggleSort}>Inicio</SortableTableHead>
          <SortableTableHead sortKey="end_date" currentSort={sortKey} currentDirection={sortDirection} onSort={toggleSort}>Fin</SortableTableHead>
          <TableHead>Duración</TableHead>
          <SortableTableHead sortKey="status" currentSort={sortKey} currentDirection={sortDirection} onSort={toggleSort}>Estado</SortableTableHead>
          <TableHead>Acciones</TableHead>
        </TableRow>
      }
      renderRow={(b) => (
        <TableRow key={b.id} className="hover:bg-muted/50 border-l-2 border-transparent hover:border-primary transition-colors">
          <TableCell className="font-medium">{b.forklifts?.name || "—"}</TableCell>
          <TableCell>
            <div className="flex items-center gap-2">
              {b.customer_name || "—"}
              <RecurringBillingBadge booking={b} />
            </div>
          </TableCell>
          <TableCell className="text-sm text-muted-foreground">{formatDate(b.start_date)}</TableCell>
          <TableCell className="text-sm text-muted-foreground">{formatDate(b.end_date)}</TableCell>
          <TableCell className="text-sm text-muted-foreground">{getDuration(b.start_date, b.end_date)}</TableCell>
          <TableCell><StatusBadge status={b.status} /></TableCell>
          <TableCell onClick={(e) => e.stopPropagation()}>
            <BookingActions booking={b} />
          </TableCell>
        </TableRow>
      )}
      customContent={mobileContent}
      skeletonColumns={7}
    />
  );
}
