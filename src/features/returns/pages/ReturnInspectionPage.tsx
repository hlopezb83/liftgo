import { useMemo, useState } from "react";
import { useLiftgoTable, type ColumnDef } from "@/components/dataTable/v2";
import { ListTruncationNotice } from "@/components/feedback/ListTruncationNotice";
import { StatusBadge } from "@/components/feedback/StatusBadge";
import { DatePickerField } from "@/components/forms/DatePickerField";
import { PlusCircle } from "@/components/icons";
import { ListPageLayout } from "@/components/layout/ListPageLayout";
import { Button } from "@/components/ui/button";
import { useForkliftMap } from "@/features/fleet";
import { useHasModuleAccess } from "@/features/users";
import { useNavigateTransition } from "@/hooks/useNavigateTransition";
import { formatDateMty, toYMD } from "@/lib/format/dateFormats";
import { useSearchParams } from "@/lib/router-compat";
import { visibleListRows } from "@/lib/supabase/constants";
import { ReturnInspectionDialog } from "../components/return-inspection/ReturnInspectionDialog";
import { ReturnInspectionMobileCard } from "../components/return-inspection/ReturnInspectionMobileCard";
import { useReturnInspectionDialog } from "../hooks/returnInspection/useReturnInspectionDialog";
import { useReturnableBookings } from "../hooks/useReturnableBookings";
import { useReturnInspections } from "../hooks/useReturnInspections";

type Inspection = NonNullable<ReturnType<typeof useReturnInspections>["data"]>[number];
const EMPTY_INSPECTIONS: Inspection[] = [];

const RETURN_INSPECTION_COLUMNS: ColumnDef<Inspection>[] = [
  {
    id: "inspection_number",
    header: "Devolución #",
    accessorKey: "inspection_number",
    cell: ({ row }) => <span className="font-mono text-sm text-primary">{row.original.inspection_number}</span>,
  },
  {
    id: "inspected_at",
    header: "Fecha",
    accessorKey: "inspected_at",
    cell: ({ row }) => <span className="font-mono text-sm">{formatDateMty(row.original.inspected_at)}</span>,
  },
  {
    id: "forklift_name",
    header: "Montacargas",
    accessorFn: (i) => i.forklifts?.name || "",
    cell: ({ row }) => <span className="font-medium">{row.original.forklifts?.name || "—"}</span>,
  },
  {
    id: "customer_name",
    header: "Cliente",
    accessorFn: (i) => i.bookings?.customer_name || "",
    cell: ({ row }) => row.original.bookings?.customer_name || "—",
  },
  {
    id: "condition",
    header: "Condición",
    accessorKey: "condition",
    cell: ({ row }) => <StatusBadge status={row.original.condition} />,
  },
  {
    id: "inspected_by",
    header: "Inspector",
    accessorFn: (i) => i.inspected_by || "",
    cell: ({ row }) => row.original.inspected_by || "—",
  },
];

export default function ReturnInspectionPage() {
  const canWrite = useHasModuleAccess("Entregas", "full");
  const navigate = useNavigateTransition();
  const [searchParams] = useSearchParams();
  const { forkliftMap } = useForkliftMap();
  const { data: inspectionsRaw, isLoading, isError, error, refetch } = useReturnInspections();
  const inspections = useMemo(() => visibleListRows(inspectionsRaw), [inspectionsRaw]);

  const [filterDate, setFilterDate] = useState<Date | undefined>();

  const isEarlyReturn = searchParams.get("early") === "1";
  const requestedBookingId = searchParams.get("booking_id");
  const returnable = useReturnableBookings({
    early: isEarlyReturn,
    bookingId: requestedBookingId,
    enabled: canWrite,
  });
  const activeBookings = useMemo(() => visibleListRows(returnable.data), [returnable.data]);
  const { dialogOpen, setDialogOpen, form, openNew, handleSubmit, isPending, inspectorLocked } =
    useReturnInspectionDialog(activeBookings, canWrite);
  const openNewInspection = () => {
    void returnable.refetch();
    openNew();
  };

  const filteredInspections = useMemo(() => {
    if (!inspections) return EMPTY_INSPECTIONS;
    if (!filterDate) return inspections;
    const targetDay = formatDateMty(toYMD(filterDate));
    // B-12: `inspected_at` es timestamptz — su día calendario se deriva
    // en TZ Monterrey (misma fuente de "hoy" que el filtro de rentas,
    // líneas 37-41), no en la TZ del navegador. El día del picker ya
    // viene como fecha local elegida por el usuario.
    return inspections.filter((i) => formatDateMty(i.inspected_at) === targetDay);
  }, [inspections, filterDate]);

  const table = useLiftgoTable<Inspection>({
    data: filteredInspections,
    columns: RETURN_INSPECTION_COLUMNS,
    getRowId: (i) => i.id,
  });

  return (
    <>
      <ListPageLayout
        title="Devoluciones y Revisión"
        subtitle="Inspecciona equipos devueltos y actualiza el estado de la flota"
        totalCount={filteredInspections?.length}
        notice={
          <ListTruncationNotice rows={inspectionsRaw} />
        }
        filters={
          <div className="flex flex-wrap items-end gap-3">
            <DatePickerField label="Filtrar por fecha" date={filterDate} onSelect={setFilterDate} placeholder="Todas las fechas" />
            {filterDate && (
              <Button variant="ghost" size="sm" onClick={() => setFilterDate(undefined)}>
                Limpiar
              </Button>
            )}
          </div>
        }
        actions={canWrite ? (
          <Button onClick={openNewInspection} size="sm">
            <PlusCircle className="h-4 w-4 mr-1" /> Nueva Devolución
          </Button>
        ) : undefined}
        isLoading={isLoading}
        isError={isError}
        error={error}
        onRetry={() => { void refetch(); }}
        hasActiveFilters={!!filterDate}
        onClearFilters={() => setFilterDate(undefined)}
        table={table}
        rowAction={{ columnId: "inspection_number", label: (ins) => `Ver devolución ${ins.inspection_number}`, to: (ins) => `/returns/${ins.id}` }}
        onRowClick={(ins) => navigate(`/returns/${ins.id}`)}
        emptyMessage="No hay inspecciones de devolución"
        emptyActionLabel={canWrite ? "Nueva Devolución" : undefined}
        onEmptyAction={canWrite ? openNewInspection : undefined}
        mobileCardRender={(ins) => <ReturnInspectionMobileCard inspection={ins} />}
      />

      {canWrite && <ReturnInspectionDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        form={form}
        activeBookings={activeBookings}
        bookingsRaw={returnable.data}
        bookingsLoading={returnable.isLoading}
        bookingsError={returnable.isError}
        bookingsRetrying={returnable.isFetching}
        onRetryBookings={() => { void returnable.refetch(); }}
        requestedBookingId={requestedBookingId}
        isEarlyReturn={isEarlyReturn}
        forkliftMap={forkliftMap}
        isPending={isPending}
        onSubmit={handleSubmit}
        inspectorLocked={inspectorLocked}
      />}
    </>
  );
}
