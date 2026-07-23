import { format } from "date-fns";
import { useState } from "react";
import { useSearchParams } from "react-router";

import { useLiftgoTable, type ColumnDef } from "@/components/dataTable/v2";
import { StatusBadge } from "@/components/feedback/StatusBadge";
import { DatePickerField } from "@/components/forms/DatePickerField";
import { PlusCircle } from "@/components/icons";
import { ListPageLayout } from "@/components/layout/ListPageLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useBookings } from "@/features/bookings";
import { useForkliftMap } from "@/features/fleet";
import { useNavigateTransition } from "@/hooks/useNavigateTransition";
import { formatCurrency } from "@/lib/format/formatCurrency";
import { parseDateLocal } from "@/lib/utils";
import { ReturnInspectionDialog } from "../components/return-inspection/ReturnInspectionDialog";
import { useReturnInspectionDialog } from "../hooks/returnInspection/useReturnInspectionDialog";
import { useReturnInspections } from "../hooks/useReturnInspections";

type Inspection = NonNullable<ReturnType<typeof useReturnInspections>["data"]>[number];

export default function ReturnInspectionPage() {
  const navigate = useNavigateTransition();
  const [searchParams] = useSearchParams();
  const { data: bookings } = useBookings();
  const { forkliftMap } = useForkliftMap();
  const { data: inspections, isLoading, isError, refetch } = useReturnInspections();

  const [filterDate, setFilterDate] = useState<Date | undefined>();

  // R10 Bloque 7: en modo `?early=1`, incluir rentas vigentes con fin futuro
  // para permitir devolución anticipada. En modo normal, exigir end_date <= hoy.
  const isEarlyReturn = searchParams.get("early") === "1";
  const today = new Date();
  today.setHours(23, 59, 59, 999);
  const activeBookings = bookings?.filter(
    (b) => b.status === "confirmed"
      && !b.return_status
      && (isEarlyReturn || parseDateLocal(b.end_date) <= today),
  );

  const { dialogOpen, setDialogOpen, form, openNew, handleSubmit, isPending } =
    useReturnInspectionDialog(bookings, activeBookings);


  const filteredInspections = !inspections
    ? []
    : !filterDate
      ? inspections
      : inspections.filter((i) => {
          // `inspected_at` es timestamptz; `new Date` respeta la TZ del navegador.
          const d = new Date(i.inspected_at);
          return (
            d.getFullYear() === filterDate.getFullYear() &&
            d.getMonth() === filterDate.getMonth() &&
            d.getDate() === filterDate.getDate()
          );
        });

  const columns: ColumnDef<Inspection>[] = [
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
      cell: ({ row }) => <span className="font-mono text-sm">{format(new Date(row.original.inspected_at), "dd/MM/yyyy")}</span>,
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

  const table = useLiftgoTable<Inspection>({
    data: filteredInspections,
    columns,
    getRowId: (i) => i.id,
  });

  return (
    <>
      <ListPageLayout
        title="Devoluciones y Revisión"
        subtitle="Inspecciona equipos devueltos y actualiza el estado de la flota"
        totalCount={filteredInspections?.length}
        filters={
          <div className="flex items-end gap-3">
            <DatePickerField label="Filtrar por fecha" date={filterDate} onSelect={setFilterDate} placeholder="Todas las fechas" />
            {filterDate && (
              <Button variant="ghost" size="sm" onClick={() => setFilterDate(undefined)}>
                Limpiar
              </Button>
            )}
          </div>
        }
        actions={
          <Button onClick={openNew} size="sm">
            <PlusCircle className="h-4 w-4 mr-1" /> Nueva Devolución
          </Button>
        }
        isLoading={isLoading}
        isError={isError}
        onRetry={() => { void refetch(); }}
        table={table}
        onRowClick={(ins) => navigate(`/returns/${ins.id}`)}
        emptyMessage="No hay inspecciones de devolución"
        mobileCardRender={(ins) => (
          <Card className="cursor-pointer" onClick={() => navigate(`/returns/${ins.id}`)}>
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-mono text-muted-foreground">{ins.inspection_number}</span>
                <StatusBadge status={ins.condition} />
              </div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm font-semibold">{ins.forklifts?.name || "—"}</span>
              </div>
              <p className="text-sm text-muted-foreground">{ins.bookings?.customer_name || "—"}</p>
              <div className="flex items-center justify-between mt-2 text-xs text-muted-foreground">
                <span className="font-mono">{format(new Date(ins.inspected_at), "dd/MM/yyyy")}</span>
                {ins.damage_cost ? (
                  <span className="font-mono font-medium text-foreground">{formatCurrency(ins.damage_cost)}</span>
                ) : null}
              </div>
            </CardContent>
          </Card>
        )}
      />

      <ReturnInspectionDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        form={form}
        activeBookings={activeBookings}
        forkliftMap={forkliftMap}
        isPending={isPending}
        onSubmit={handleSubmit}
      />
    </>
  );
}
