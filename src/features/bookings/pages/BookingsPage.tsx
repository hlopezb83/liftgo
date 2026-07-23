import { differenceInDays, parseISO } from "date-fns";
import { useLiftgoTable, type ColumnDef } from "@/components/dataTable/v2";
import { StatusBadge } from "@/components/feedback/StatusBadge";
import { FiltersToolbar } from "@/components/filters/FiltersToolbar";
import { AddIcon, ChevronRightIcon, CalendarDays, WarnIcon } from "@/components/icons";
import { ListPageLayout } from "@/components/layout/ListPageLayout";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { usePageActions } from "@/contexts/pageActions";
import { useUserRole } from "@/features/users";
import { useTableFilters } from "@/hooks/filters/useTableFilters";
import { useNavigateTransition } from "@/hooks/useNavigateTransition";
import { BOOKING_STATUSES, STATUS_LABELS } from "@/lib/constants";
import { LIST_PAGE_LIMIT, hasReachedListLimit } from "@/lib/supabase/constants";
import { formatMtyDate } from "@/lib/utils";
import { RecurringBillingBadge } from "../components/bookings/RecurringBillingBadge";
import { useBookings, bookingQueries } from "../hooks/bookings/useBookings";

const STATUSES = ["all", ...BOOKING_STATUSES] as const;
type BookingStatus = (typeof STATUSES)[number];
const STATUS_OPTIONS = STATUSES.map((s) => ({ value: s, label: STATUS_LABELS[s] || s }));

type Booking = NonNullable<ReturnType<typeof useBookings>["data"]>[number];

const formatDate = (d: string) => formatMtyDate(d);
const getDuration = (start: string, end: string) => {
  // R10 Bloque 12.1: mostrar días inclusivos (end - start + 1) para que una
  // reserva "hoy → hoy" cuente como 1 día en la lista.
  const days = differenceInDays(parseISO(end), parseISO(start)) + 1;
  return `${days} día${days !== 1 ? "s" : ""}`;
};


export default function BookingsPage() {
  const { data: bookings, isLoading, isError, refetch } = useBookings();
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

  const { values, set, filtered, filterKey, hasActive, reset } = useTableFilters<Booking, {
    q: { type: "text"; fields: (keyof Booking)[] };
    status: { type: "enum"; field: keyof Booking; options: readonly BookingStatus[] };
  }>({
    items: bookings ?? [],
    facets: {
      q: { type: "text", fields: ["customer_name", "booking_number"] as (keyof Booking)[] },
      status: { type: "enum", field: "status", options: STATUSES },
    },
  });

  const table = useLiftgoTable<Booking>({
    data: filtered,
    columns,
    getRowId: (b: Booking) => b.id,
    resetKey: filterKey,
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
          <FiltersToolbar>
            <FiltersToolbar.Search
              value={values.q}
              onChange={(v) => set("q", v)}
              placeholder="Buscar por cliente…"
            />
            <FiltersToolbar.StatusTabs<BookingStatus>
              value={values.status as BookingStatus}
              onChange={(v) => set("status", v)}
              options={STATUS_OPTIONS}
            />
            <FiltersToolbar.ClearAll visible={hasActive} onClick={reset} />
          </FiltersToolbar>
        </div>
      }
      isLoading={isLoading}
      isError={isError}
      onRetry={() => { void refetch(); }}
      table={table}
      onRowClick={(b) => navigate(`/bookings/${b.id}`)}
      onRowPrefetch={(b) => bookingQueries.detail(b.id)}
      hasActiveFilters={hasActive}
      onClearFilters={reset}
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
