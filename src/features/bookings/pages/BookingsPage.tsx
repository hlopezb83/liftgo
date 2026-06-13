import { useNavigate } from "react-router-dom";
import { differenceInDays, parseISO } from "date-fns";
import { useMemo } from "react";
import { formatMtyDate } from "@/lib/utils";

import { STATUS_LABELS } from "@/lib/constants";
import { useBookings } from "@/features/bookings/hooks/useBookings";
import { useResourceList } from "@/hooks/useResourceList";
import { ListPageLayout } from "@/components/ListPageLayout";
import { SearchBar } from "@/components/SearchBar";
import { StatusBadge } from "@/components/StatusBadge";
import { RecurringBillingBadge } from "@/features/bookings/components/bookings/RecurringBillingBadge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { Plus, ChevronRight, CalendarDays } from "lucide-react";
import { type ColumnDef } from "@/components/dataTable/v2";
import { usePageActions } from "@/contexts/PageActionsContext";

const STATUSES = ["all", "confirmed", "completed", "cancelled"] as const;

type Booking = NonNullable<ReturnType<typeof useBookings>["data"]>[number];

const formatDate = (d: string) => formatMtyDate(d);
const getDuration = (start: string, end: string) => {
  const days = differenceInDays(parseISO(end), parseISO(start));
  return `${days} día${days !== 1 ? "s" : ""}`;
};

export default function BookingsPage() {
  const { data: bookings, isLoading, refetch } = useBookings();
  const navigate = useNavigate();
  usePageActions({ onNew: () => navigate("/bookings/new"), onRefresh: refetch, newLabel: "Nueva reserva" });

  const columns = useMemo<ColumnDef<Booking>[]>(
    () => [
      {
        id: "booking_number",
        header: "Reserva #",
        accessorKey: "booking_number",
        cell: ({ row }) => <span className="font-mono font-medium">{row.original.booking_number}</span>,
      },
      {
        id: "forklift_name",
        header: "Equipo",
        accessorFn: (b) => b.forklifts?.name || "",
        cell: ({ row }) => <span className="font-medium">{row.original.forklifts?.name || "—"}</span>,
      },
      {
        id: "customer_name",
        header: "Cliente",
        accessorFn: (b) => b.customer_name || "",
        cell: ({ row }) => (
          <div className="flex items-center gap-2">
            {row.original.customer_name || "—"}
            <RecurringBillingBadge booking={row.original} />
          </div>
        ),
      },
      {
        id: "start_date",
        header: "Inicio",
        accessorKey: "start_date",
        cell: ({ row }) => <span className="text-sm text-muted-foreground">{formatDate(row.original.start_date)}</span>,
      },
      {
        id: "end_date",
        header: "Fin",
        accessorKey: "end_date",
        cell: ({ row }) => <span className="text-sm text-muted-foreground">{formatDate(row.original.end_date)}</span>,
      },
      {
        id: "duration",
        header: "Duración",
        enableSorting: false,
        cell: ({ row }) => <span className="text-sm text-muted-foreground">{getDuration(row.original.start_date, row.original.end_date)}</span>,
      },
      {
        id: "status",
        header: "Estado",
        accessorKey: "status",
        cell: ({ row }) => <StatusBadge status={row.original.status} />,
      },
    ],
    [],
  );

  const { search, setSearch, statusFilter, setStatusFilter, filtered, table } =
    useResourceList<Booking>({
      items: bookings,
      columns,
      getRowId: (b) => b.id,
      filters: {
        searchFields: ["customer_name", "booking_number"],
        statusField: "status",
      },
    });

  return (
    <ListPageLayout
      onRefresh={refetch}
      title="Reservas"
      subtitle="Administrar reservas de equipos"
      totalCount={filtered.length}
      actions={<Button size="sm" onClick={() => navigate("/bookings/new")}><Plus className="h-4 w-4 mr-1" />Nueva Reserva</Button>}
      mobileFab={
        <Button size="icon" className="h-14 w-14 rounded-full shadow-lg" onClick={() => navigate("/bookings/new")} aria-label="Nueva reserva">
          <Plus className="h-6 w-6" />
        </Button>
      }
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
      table={table}
      onRowClick={(b) => navigate(`/bookings/${b.id}`)}
      emptyMessage="No se encontraron reservas"
      emptyIcon={CalendarDays}
      emptyActionLabel="Nueva Reserva"
      onEmptyAction={() => navigate("/bookings/new")}
      skeletonColumns={7}
      mobileCardRender={(b) => (
        <Card className="cursor-pointer active:scale-[0.98] transition-transform" onClick={() => navigate(`/bookings/${b.id}`)}>
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-1">
              <span className="font-mono font-semibold text-sm">{b.booking_number}</span>
              <StatusBadge status={b.status} />
            </div>
            <span className="text-sm font-medium">{b.forklifts?.name || "—"}</span>
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
  );
}
