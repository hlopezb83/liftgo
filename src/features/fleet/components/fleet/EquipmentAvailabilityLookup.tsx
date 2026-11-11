import { useId, useState } from "react";
import { DateRangePickerField } from "@/components/forms/DateRangePickerField";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useHasModuleAccess } from "@/features/users";
import { toYMD } from "@/lib/date/toYMD";
import { useAvailabilityReasons } from "../../hooks/forklifts/useAvailabilityReasons";
import { AvailabilityReasonsContent } from "./AvailabilityReasonsContent";
import type { DateRange } from "react-day-picker";

type EquipmentOption = { id: string; name: string };

function lookupPeriod(dateRange: DateRange | undefined) {
  const start = toYMD(dateRange?.from);
  const end = toYMD(dateRange?.to);
  return {
    complete: !!start && !!end,
    valid: !!start && !!end && start <= end,
    toError: start && end && start > end ? "La fecha de fin debe ser igual o posterior a la de inicio" : undefined,
  };
}

export function EquipmentAvailabilityLookup({ equipment, initialRange, triggerLabel = "Consultar disponibilidad por fechas" }: {
  equipment: ReadonlyArray<EquipmentOption>;
  initialRange?: DateRange;
  triggerLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const allowed = useHasModuleAccess("Flota", "read");
  if (!allowed) return null;
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button type="button" variant="outline" size="sm" className="min-h-11">{triggerLabel}</Button></DialogTrigger>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Disponibilidad por fechas</DialogTitle>
          <DialogDescription>Consulta el estado operativo y los motivos para un equipo y periodo.</DialogDescription>
        </DialogHeader>
        {open && <EquipmentAvailabilityFields equipment={equipment} initialRange={initialRange} />}
      </DialogContent>
    </Dialog>
  );
}

function EquipmentAvailabilityFields({ equipment, initialRange }: { equipment: ReadonlyArray<EquipmentOption>; initialRange?: DateRange }) {
  const id = useId();
  const [forkliftId, setForkliftId] = useState(equipment.length === 1 ? equipment[0].id : "");
  const [dateRange, setDateRange] = useState<DateRange | undefined>(initialRange);
  const selected = equipment.some((unit) => unit.id === forkliftId);
  const period = lookupPeriod(dateRange);
  const canQuery = selected && period.valid;
  const query = useAvailabilityReasons(dateRange, canQuery, forkliftId || undefined);
  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor={id}>Equipo</Label>
        <Select value={selected ? forkliftId : ""} onValueChange={setForkliftId}>
          <SelectTrigger id={id}><SelectValue placeholder="Selecciona un equipo" /></SelectTrigger>
          <SelectContent>{equipment.map((unit) => <SelectItem key={unit.id} value={unit.id}>{unit.name}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      <DateRangePickerField label="Fechas de consulta" dateRange={dateRange} onSelect={setDateRange} toError={period.toError} />
      {(!selected || !period.complete) && <p className="text-sm text-muted-foreground">Selecciona equipo y ambas fechas para consultar.</p>}
      {canQuery && (query.allowed ? <AvailabilityReasonsContent query={query} singleUnit />
        : <p role="status" className="text-sm text-muted-foreground">No tienes acceso para consultar este equipo.</p>)}
    </div>
  );
}
