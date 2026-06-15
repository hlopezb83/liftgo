import { useState, useMemo } from "react";
import type { ReturnInspectionWithJoins } from "@/types/rental";
import { useBookings } from "@/features/bookings";
import { useForkliftMap } from "@/features/fleet";
import { useReturnInspections } from "../hooks/useReturnInspections";
import { useReturnInspectionDialog } from "../hooks/returnInspection/useReturnInspectionDialog";
import { ListPageLayout } from "@/components/layout/ListPageLayout";
import { DatePickerField } from "@/components/forms/DatePickerField";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/feedback/StatusBadge";
import { ReturnInspectionDialog } from "../components/return-inspection/ReturnInspectionDialog";
import { formatCurrency } from "@/lib/format/formatCurrency";
import { Card, CardContent } from "@/components/ui/card";
import { PlusCircle } from "lucide-react";
import { format } from "date-fns";
import { parseDateLocal } from "@/lib/utils";
import { useNavigate } from "react-router-dom";
import { useLiftgoTable, type ColumnDef } from "@/components/dataTable/v2";

type Inspection = NonNullable<ReturnType<typeof useReturnInspections>["data"]>[number];

export default function ReturnInspectionPage() {
  const navigate = useNavigate();
  const { data: bookings } = useBookings();
  const { forkliftMap } = useForkliftMap();
  const { data: inspections, isLoading } = useReturnInspections();

  const [filterDate, setFilterDate] = useState<Date | undefined>();

  const today = new Date();
  today.setHours(23, 59, 59, 999);
  const activeBookings = bookings?.filter(
    (b) => b.status === "confirmed" && !b.return_status && new Date(b.end_date) <= today,
  );

  const { dialogOpen, setDialogOpen, form, openNew, handleSubmit, isPending } =
    useReturnInspectionDialog(bookings, activeBookings);

  const filteredInspections = useMemo(() => {
    if (!inspections) return [];
    if (!filterDate) return inspections;
    return inspections.filter((i) => {
      const d = parseDateLocal(i.inspected_at);
      return (
        d.getFullYear() === filterDate.getFullYear() &&
        d.getMonth() === filterDate.getMonth() &&
        d.getDate() === filterDate.getDate()
      );
    });
  }, [inspections, filterDate]);

  const columns = useMemo<ColumnDef<Inspection>[]>(
    () => [
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
        cell: ({ row }) => <span className="font-mono text-sm">{format(parseDateLocal(row.original.inspected_at), "dd/MM/yyyy")}</span>,
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
    ],
    [],
  );

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
                <span className="font-mono">{format(parseDateLocal(ins.inspected_at), "dd/MM/yyyy")}</span>
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
