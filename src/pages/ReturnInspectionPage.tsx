import { useState, useMemo } from "react";
import type { ReturnInspectionWithJoins } from "@/types/rental";
import { useBookings } from "@/hooks/useBookings";
import { useForkliftMap } from "@/hooks/useForkliftMap";
import { useReturnInspections } from "@/hooks/useReturnInspections";
import { useReturnInspectionDialog } from "@/hooks/returnInspection/useReturnInspectionDialog";
import { useListPage } from "@/hooks/useListPage";
import { ListPageLayout } from "@/components/ListPageLayout";
import { DatePickerField } from "@/components/DatePickerField";
import { MobileCardList } from "@/components/MobileCardList";
import { SortableTableHead } from "@/components/SortableTableHead";
import { Button } from "@/components/ui/button";
import { TableRow, TableCell } from "@/components/ui/table";
import { StatusBadge } from "@/components/StatusBadge";
import { ReturnInspectionDialog } from "@/components/return-inspection/ReturnInspectionDialog";
import { formatCurrency } from "@/lib/formatCurrency";
import { Card, CardContent } from "@/components/ui/card";
import { PlusCircle } from "lucide-react";
import { format } from "date-fns";
import { parseDateLocal } from "@/lib/utils";
import { useNavigate } from "react-router-dom";

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

  const { dialogOpen, setDialogOpen, form, set, openNew, handleSubmit, isPending } =
    useReturnInspectionDialog(bookings, activeBookings);

  const filteredInspections = useMemo(() => {
    if (!inspections) return undefined;
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

  const { sortKey, sortDirection, toggleSort, page, setPage, totalPages, paginatedItems, isMobile } = useListPage(
    filteredInspections,
    {
      accessors: {
        inspection_number: (i) => i.inspection_number,
        inspected_at: (i) => i.inspected_at,
        forklift_name: (i) => (i as ReturnInspectionWithJoins).forklifts?.name || "",
        customer_name: (i) => (i as ReturnInspectionWithJoins).bookings?.customer_name || "",
        condition: (i) => i.condition,
        damage_cost: (i) => i.damage_cost || 0,
        inspected_by: (i) => i.inspected_by || "",
      },
    },
  );

  const mobileContent = isMobile ? (
    <MobileCardList
      items={paginatedItems}
      keyExtractor={(ins) => ins.id}
      emptyMessage="No hay inspecciones de devolución"
      renderCard={(ins) => {
        const insWithJoins = ins as ReturnInspectionWithJoins;
        return (
          <Card className="cursor-pointer" onClick={() => navigate(`/returns/${ins.id}`)}>
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-mono text-muted-foreground">{ins.inspection_number}</span>
                <StatusBadge status={ins.condition} />
              </div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm font-semibold">{insWithJoins.forklifts?.name || "—"}</span>
              </div>
              <p className="text-sm text-muted-foreground">{insWithJoins.bookings?.customer_name || "—"}</p>
              <div className="flex items-center justify-between mt-2 text-xs text-muted-foreground">
                <span className="font-mono">{format(parseDateLocal(ins.inspected_at), "dd/MM/yyyy")}</span>
                {ins.damage_cost ? (
                  <span className="font-mono font-medium text-foreground">{formatCurrency(ins.damage_cost)}</span>
                ) : null}
              </div>
            </CardContent>
          </Card>
        );
      }}
    />
  ) : undefined;

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
        items={paginatedItems}
        page={page}
        totalPages={totalPages}
        onPageChange={setPage}
        emptyMessage="No hay inspecciones de devolución"
        tableHeader={
          <TableRow>
            <SortableTableHead sortKey="inspection_number" currentSort={sortKey} currentDirection={sortDirection} onSort={toggleSort}>Devolución #</SortableTableHead>
            <SortableTableHead sortKey="inspected_at" currentSort={sortKey} currentDirection={sortDirection} onSort={toggleSort}>Fecha</SortableTableHead>
            <SortableTableHead sortKey="forklift_name" currentSort={sortKey} currentDirection={sortDirection} onSort={toggleSort}>Montacargas</SortableTableHead>
            <SortableTableHead sortKey="customer_name" currentSort={sortKey} currentDirection={sortDirection} onSort={toggleSort}>Cliente</SortableTableHead>
            <SortableTableHead sortKey="condition" currentSort={sortKey} currentDirection={sortDirection} onSort={toggleSort}>Condición</SortableTableHead>
            <SortableTableHead sortKey="inspected_by" currentSort={sortKey} currentDirection={sortDirection} onSort={toggleSort}>Inspector</SortableTableHead>
          </TableRow>
        }
        renderRow={(ins) => {
          const insWithJoins = ins as ReturnInspectionWithJoins;
          return (
            <TableRow key={ins.id} className="hover:bg-muted/50 cursor-pointer border-l-2 border-transparent hover:border-primary transition-colors" onClick={() => navigate(`/returns/${ins.id}`)}>
              <TableCell className="font-mono text-sm text-primary">{ins.inspection_number}</TableCell>
              <TableCell className="font-mono text-sm">{format(parseDateLocal(ins.inspected_at), "dd/MM/yyyy")}</TableCell>
              <TableCell className="font-medium">{insWithJoins.forklifts?.name || "—"}</TableCell>
              <TableCell>{insWithJoins.bookings?.customer_name || "—"}</TableCell>
              <TableCell><StatusBadge status={ins.condition} /></TableCell>
              <TableCell>{ins.inspected_by || "—"}</TableCell>
            </TableRow>
          );
        }}
        customContent={mobileContent}
      />

      <ReturnInspectionDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        form={form}
        set={set}
        activeBookings={activeBookings}
        forkliftMap={forkliftMap}
        isPending={isPending}
        onSubmit={handleSubmit}
      />
    </>
  );
}
