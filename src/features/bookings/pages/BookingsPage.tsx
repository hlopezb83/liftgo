
import { differenceInDays, parseISO } from "date-fns";
import { type ColumnDef } from "@/components/dataTable/v2";
import { StatusBadge } from "@/components/feedback/StatusBadge";
import { SearchBar } from "@/components/forms/SearchBar";
import { AddIcon, ChevronRightIcon, CalendarDays, WarnIcon } from "@/components/icons";
import { ListPageLayout } from "@/components/layout/ListPageLayout";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { usePageActions } from "@/contexts/pageActions";
import { useUserRole } from "@/features/users";
import { useTableFilters } from "@/hooks/filters/useTableFilters";
import { useNavigateTransition } from "@/hooks/useNavigateTransition";
import { useResourceList } from "@/hooks/useResourceList";
import { BOOKING_STATUSES, STATUS_LABELS } from "@/lib/constants";
import { LIST_PAGE_LIMIT, hasReachedListLimit } from "@/lib/supabase/constants";
import { formatMtyDate } from "@/lib/utils";
import { RecurringBillingBadge } from "../components/bookings/RecurringBillingBadge";
import { useBookings, bookingQueries } from "../hooks/useBookings";

const STATUSES = ["all", ...BOOKING_STATUSES] as const;
type BookingStatusFilter = (typeof STATUSES)[number];


type Booking = NonNullable<ReturnType<typeof useBookings>["data"]>[number];

const formatDate = (d: string) => formatMtyDate(d);
const getDuration = (start: string, end: string) => {
  const days = differenceInDays(parseISO(end), parseISO(start));
  return `${days} día${days !== 1 ? "s" : ""}`;
};

export default function BookingsPage() {
  const { data: bookings, isLoading, refetch } = useBookings();
  const navigate = useNavigateTransition();
  const { data: role } = useUserRole();
  const isAdmin = role === "admin";
  usePageActions({ onNew: isAdmin ? () => navigate("/bookings/new") : undefined, onRefresh: refetch, newLabel: "Nueva reserva" });

  const columns: ColumnDef<Booking>[] = [
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
    ];

  const { values, set, filtered, filterKey } = useTableFilters<Booking, {
    q: { type: "text"; fields: (keyof Booking)[] };
    status: { type: "enum"; field: keyof Booking; options: readonly (typeof STATUSES)[number][] };
  }>({
    items: bookings ?? [],
    facets: {
      q: { type: "text", fields: ["customer_name", "booking_number"] as (keyof Booking)[] },
      status: { type: "enum", field: "status", options: STATUSES },
    },
  });
  const search = values.q;
  const setSearch = (v: string) => set("q", v);
  const statusFilter = values.status as string;
  const setStatusFilter = (v: string) => set("status", v);

  const { table } = useResourceList<Booking>({
    data: filtered,
    columns,
    getRowId: (b) => b.id,
    tableResetKey: filterKey,
  });

  return (
    <ListPageLayout
      onRefresh={refetch}
      title="Reservas"
      subtitle="Administrar reservas de equipos"
      totalCount={filtered.length}
      actions={isAdmin ? <Button size="sm" onClick={() => navigate("/bookings/new")}><AddIcon className="h-4 w-4 mr-1" />Nueva Reserva</Button> : undefined}
      mobileFab={
        isAdmin ? (
          <Button size="icon" className="h-14 w-14 rounded-full shadow-lg" onClick={() => navigate("/bookings/new")} aria-label="Nueva reserva">
            <AddIcon className="h-6 w-6" />
          </Button>
        ) : undefined
      }
      filters={
        <div className="space-y-3">
          {hasReachedListLimit(bookings) && (
            <Alert>
              <WarnIcon className="h-4 w-4" />
              <AlertDescription>
                Mostrando los primeros {LIST_PAGE_LIMIT} registros. Refina los filtros para ver más.
              </AlertDescription>
            </Alert>
          )}
          <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
            <Tabs value={statusFilter} onValueChange={setStatusFilter}>
              <TabsList className="flex-nowrap overflow-x-auto w-full sm:w-auto">
                {STATUSES.map((s) => <TabsTrigger key={s} value={s}>{STATUS_LABELS[s] || s}</TabsTrigger>)}
              </TabsList>
            </Tabs>
            <SearchBar value={search} onChange={setSearch} placeholder="Buscar por cliente…" className="w-full sm:w-64" />
          </div>
        </div>
      }
      isLoading={isLoading}
      table={table}
      onRowClick={(b) => navigate(`/bookings/${b.id}`)}
      onRowPrefetch={(b) => bookingQueries.detail(b.id)}
      emptyMessage={isAdmin ? "No se encontraron reservas" : "No se encontraron reservas. Las reservas se crean convirtiendo una cotización aceptada."}
      emptyIcon={CalendarDays}
      emptyActionLabel={isAdmin ? "Nueva Reserva" : undefined}
      onEmptyAction={isAdmin ? () => navigate("/bookings/new") : undefined}
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
              <ChevronRightIcon className="h-4 w-4 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>
      )}
    />
  );
}
