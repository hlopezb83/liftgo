import { useState, useMemo, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import type { ReturnInspectionWithJoins } from "@/types/rental";
import { useBookings } from "@/hooks/useBookings";
import { useForkliftMap } from "@/hooks/useForkliftMap";
import { useCreateReturnInspection, useReturnInspections } from "@/hooks/useReturnInspections";
import { useListPage } from "@/hooks/useListPage";
import { ListPageLayout } from "@/components/ListPageLayout";
import { DatePickerField } from "@/components/DatePickerField";
import { MobileCardList } from "@/components/MobileCardList";
import { SortableTableHead } from "@/components/SortableTableHead";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TableRow, TableCell } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { StatusBadge } from "@/components/StatusBadge";
import { FormActions } from "@/components/FormActions";

import { useFormState } from "@/hooks/useFormState";
import { formatDateDisplay } from "@/lib/utils";
import { formatCurrency } from "@/lib/formatCurrency";
import { INSPECTION_CONDITIONS, FUEL_LEVELS, STATUS_LABELS, FUEL_LEVEL_LABELS } from "@/lib/constants";
import { Card, CardContent } from "@/components/ui/card";
import { PlusCircle, ClipboardCheck } from "lucide-react";
import { DragDropImageUploader } from "@/components/DragDropImageUploader";
import { toast } from "sonner";
import { format } from "date-fns";
import { parseDateLocal } from "@/lib/utils";
import { useSearchParams } from "react-router-dom";

const initialForm = {
  bookingId: "" as string,
  inspectedAt: new Date() as Date,
  condition: "good" as string,
  damageNotes: "" as string,
  damageCost: "" as string,
  hoursUsed: "" as string,
  fuelLevel: "" as string,
  inspectedBy: "" as string,
};


export default function ReturnInspectionPage() {
  const { data: bookings } = useBookings();
  const { forkliftMap } = useForkliftMap();
  const { data: inspections, isLoading } = useReturnInspections();
  const createInspection = useCreateReturnInspection();
  const [dialogOpen, setDialogOpen] = useState(false);
  const { form, set, reset } = useFormState(initialForm);
  
  const [searchParams, setSearchParams] = useSearchParams();
  const [filterDate, setFilterDate] = useState<Date | undefined>();

  const filteredInspections = useMemo(() => {
    if (!inspections) return undefined;
    if (!filterDate) return inspections;
    return inspections.filter((i) => {
      const d = parseDateLocal(i.inspected_at);
      return d.getFullYear() === filterDate.getFullYear() && d.getMonth() === filterDate.getMonth() && d.getDate() === filterDate.getDate();
    });
  }, [inspections, filterDate]);

  const today = new Date();
  today.setHours(23, 59, 59, 999);
  const activeBookings = bookings?.filter((b) => b.status === "confirmed" && !b.return_status && new Date(b.end_date) <= today);

  useEffect(() => {
    const bookingId = searchParams.get("booking_id");
    if (bookingId && activeBookings?.some((b) => b.id === bookingId)) {
      reset();
      set("bookingId", bookingId);
      setDialogOpen(true);
      setSearchParams({}, { replace: true });
    }
  }, [searchParams, activeBookings]);

  const { sortKey, sortDirection, toggleSort, page, setPage, totalPages, paginatedItems, isMobile } = useListPage(filteredInspections, {
    accessors: {
      inspection_number: (i) => i.inspection_number,
      inspected_at: (i) => i.inspected_at,
      forklift_name: (i) => (i as ReturnInspectionWithJoins).forklifts?.name || "",
      customer_name: (i) => (i as ReturnInspectionWithJoins).bookings?.customer_name || "",
      condition: (i) => i.condition,
      damage_cost: (i) => i.damage_cost || 0,
      inspected_by: (i) => i.inspected_by || "",
    },
  });

  const mobileContent = isMobile ? (
    <MobileCardList
      items={paginatedItems}
      keyExtractor={(ins) => ins.id}
      emptyMessage="No hay inspecciones de devolución"
      renderCard={(ins) => {
        const insWithJoins = ins as ReturnInspectionWithJoins;
        return (
          <Card>
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
                {ins.damage_cost ? <span className="font-mono font-medium text-foreground">{formatCurrency(ins.damage_cost)}</span> : null}
              </div>
            </CardContent>
          </Card>
        );
      }}
    />
  ) : undefined;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.bookingId) { toast.error("Selecciona una reserva para devolver"); return; }
    const booking = bookings?.find((b) => b.id === form.bookingId);
    if (!booking) return;
    const damageCost = form.damageCost ? parseFloat(form.damageCost) : 0;
    createInspection.mutate(
      {
        booking_id: form.bookingId, forklift_id: booking.forklift_id, condition: form.condition,
        damage_notes: form.damageNotes || null, damage_cost: damageCost,
        hours_used: form.hoursUsed ? parseFloat(form.hoursUsed) : null, fuel_level: form.fuelLevel || null, inspected_by: form.inspectedBy || null,
        inspected_at: form.inspectedAt.toISOString(),
      },
      {
        onSuccess: () => {
          toast.success("Inspección de devolución registrada — montacargas marcado como disponible");
          setDialogOpen(false);
          reset();
        },
      }
    );
  };

  return (
    <>
      <ListPageLayout
        title="Devoluciones y Revisión"
        subtitle="Inspecciona equipos devueltos y actualiza el estado de la flota"
        filters={
          <div className="flex items-end gap-3">
            <DatePickerField label="Filtrar por fecha" date={filterDate} onSelect={setFilterDate} placeholder="Todas las fechas" />
            {filterDate && (
              <Button variant="ghost" size="sm" onClick={() => setFilterDate(undefined)}>Limpiar</Button>
            )}
          </div>
        }
        actions={
          <Button onClick={() => { reset(); setDialogOpen(true); }} size="sm">
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
            <SortableTableHead sortKey="damage_cost" currentSort={sortKey} currentDirection={sortDirection} onSort={toggleSort}>Costo por Daños</SortableTableHead>
            <SortableTableHead sortKey="inspected_by" currentSort={sortKey} currentDirection={sortDirection} onSort={toggleSort}>Inspector</SortableTableHead>
          </TableRow>
        }
        renderRow={(ins) => {
          const insWithJoins = ins as ReturnInspectionWithJoins;
          return (
            <TableRow key={ins.id} className="hover:bg-muted/50 border-l-2 border-transparent hover:border-primary transition-colors">
              <TableCell className="font-mono text-sm text-primary">{ins.inspection_number}</TableCell>
              <TableCell className="font-mono text-sm">{format(parseDateLocal(ins.inspected_at), "dd/MM/yyyy")}</TableCell>
              <TableCell className="font-medium">{insWithJoins.forklifts?.name || "—"}</TableCell>
              <TableCell>{insWithJoins.bookings?.customer_name || "—"}</TableCell>
              <TableCell><StatusBadge status={ins.condition} /></TableCell>
              <TableCell className="font-mono">{ins.damage_cost ? formatCurrency(ins.damage_cost) : "—"}</TableCell>
              <TableCell>{ins.inspected_by || "—"}</TableCell>
            </TableRow>
          );
        }}
        customContent={mobileContent}
      />

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ClipboardCheck className="h-4 w-4" /> Inspección de Devolución
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label>Reserva a Devolver *</Label>
              <Select value={form.bookingId} onValueChange={(v) => set("bookingId", v)}>
                <SelectTrigger><SelectValue placeholder="Seleccionar reserva activa" /></SelectTrigger>
                <SelectContent>
                  {activeBookings?.map((b) => (
                    <SelectItem key={b.id} value={b.id}>
                      {forkliftMap.get(b.forklift_id)?.name} — {b.customer_name || "Desconocido"} ({formatDateDisplay(b.start_date)} → {formatDateDisplay(b.end_date)})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Solo se muestran reservas cuyo periodo de renta ha finalizado. Si no encuentras la reserva, verifica que la fecha de fin ya haya pasado o{" "}
                <a href="/bookings" className="underline text-primary hover:text-primary/80 transition-colors">
                  edita la reserva
                </a>{" "}
                para ajustar las fechas antes de registrar la devolución.
              </p>
            </div>
            <DatePickerField label="Fecha de Inspección" date={form.inspectedAt} onSelect={(d) => set("inspectedAt", d || new Date())} required />
            <div className="space-y-1.5">
              <Label>Condición *</Label>
              <Select value={form.condition} onValueChange={(v) => set("condition", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {INSPECTION_CONDITIONS.map((c) => (
                    <SelectItem key={c} value={c} className="capitalize">{STATUS_LABELS[c] || c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Notas de Daños</Label>
              <Textarea value={form.damageNotes} onChange={(e) => set("damageNotes", e.target.value)} placeholder="Describe cualquier daño..." rows={3} />
            </div>
            {form.bookingId && (() => {
              const selectedBooking = bookings?.find((b) => b.id === form.bookingId);
              if (!selectedBooking) return null;
              return (
                <div className="space-y-1.5">
                  <Label>Fotos de Inspección</Label>
                  <DragDropImageUploader entityType="return_inspection" entityId={selectedBooking.forklift_id} maxFiles={8} />
                </div>
              );
            })()}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Costo por Daños ($)</Label>
                <Input type="number" step="0.01" value={form.damageCost} onChange={(e) => set("damageCost", e.target.value)} placeholder="0" />
              </div>
              <div className="space-y-1.5">
                <Label>Horas de Uso</Label>
                <Input type="number" step="0.1" value={form.hoursUsed} onChange={(e) => set("hoursUsed", e.target.value)} placeholder="0" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Nivel de Combustible</Label>
                <Select value={form.fuelLevel} onValueChange={(v) => set("fuelLevel", v)}>
                  <SelectTrigger><SelectValue placeholder="Seleccionar" /></SelectTrigger>
                  <SelectContent>
                    {FUEL_LEVELS.map((l) => (
                      <SelectItem key={l} value={l}>{FUEL_LEVEL_LABELS[l] || l}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Inspeccionado Por</Label>
                <Input value={form.inspectedBy} onChange={(e) => set("inspectedBy", e.target.value)} placeholder="Nombre del inspector" />
              </div>
            </div>
            <FormActions submitLabel="Completar Devolución" isPending={createInspection.isPending} onCancel={() => setDialogOpen(false)} />
          </form>
        </DialogContent>
      </Dialog>

    </>
  );
}
