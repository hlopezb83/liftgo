import { useState, useMemo, useEffect } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { formatCurrency } from "@/lib/formatCurrency";
import type { RentalLineMeta } from "@/lib/lineItems";
import type { Tables } from "@/integrations/supabase/types";

type Forklift = Tables<"forklifts">;
type EquipmentModel = Tables<"equipment_models">;

export interface AssignmentResult {
  forkliftId: string;
  dailyRate: number;
  weeklyRate: number;
  monthlyRate: number;
}

interface AssignmentSlot {
  modelId: string;
  modelName: string;
  forkliftId: string;
  dailyRate: number;
  weeklyRate: number;
  monthlyRate: number;
}

function buildAssignmentSlots(rentalMeta: RentalLineMeta[], models: EquipmentModel[]): AssignmentSlot[] {
  const result: AssignmentSlot[] = [];
  for (const line of rentalMeta) {
    const model = models.find((m) => m.id === line.modelId);
    const modelName = model ? `${model.manufacturer} ${model.model}` : "Equipo";
    const daily = line.dailyRate ?? model?.default_daily_rate ?? 0;
    const weekly = line.weeklyRate ?? model?.default_weekly_rate ?? 0;
    const monthly = line.monthlyRate ?? model?.default_monthly_rate ?? 0;
    for (let i = 0; i < line.quantity; i++) {
      result.push({ modelId: line.modelId, modelName, forkliftId: "", dailyRate: daily, weeklyRate: weekly, monthlyRate: monthly });
    }
  }
  return result;
}

interface EquipmentAssignmentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rentalMeta: RentalLineMeta[];
  models: EquipmentModel[];
  forklifts: Forklift[];
  onConfirm: (assignments: AssignmentResult[]) => void;
  isLoading?: boolean;
}

export function EquipmentAssignmentDialog({
  open, onOpenChange, rentalMeta, models, forklifts, onConfirm, isLoading,
}: EquipmentAssignmentDialogProps) {
  const slots = useMemo(() => buildAssignmentSlots(rentalMeta, models), [rentalMeta, models]);

  const [assignments, setAssignments] = useState<AssignmentSlot[]>(slots);

  useEffect(() => { setAssignments(slots); }, [slots]);

  const getAvailableForModel = (modelId: string, currentSlotIndex: number) => {
    const model = models.find((m) => m.id === modelId);
    if (!model) return [];
    const alreadyAssigned = new Set(
      assignments.filter((a, i) => i !== currentSlotIndex && a.forkliftId).map((a) => a.forkliftId)
    );
    return forklifts.filter(
      (f) =>
        f.status === "available" &&
        f.manufacturer === model.manufacturer &&
        f.model === model.model &&
        !alreadyAssigned.has(f.id)
    );
  };

  const updateAssignment = (index: number, forkliftId: string) => {
    setAssignments((prev) => prev.map((a, i) => (i === index ? { ...a, forkliftId } : a)));
  };

  const allAssigned = assignments.every((a) => a.forkliftId);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Asignar Equipos</DialogTitle>
          <DialogDescription>
            Selecciona el montacargas específico para cada unidad cotizada. Las tarifas pactadas en la cotización
            se aplicarán al equipo asignado.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 max-h-[50vh] overflow-y-auto py-2">
          {assignments.map((slot, index) => {
            const available = getAvailableForModel(slot.modelId, index);
            return (
              <div key={index} className="space-y-1.5">
                <div className="flex items-center gap-2">
                  <Label className="text-sm">{slot.modelName}</Label>
                  <Badge variant="outline" className="text-xs">Unidad {index + 1}</Badge>
                </div>
                <Select value={slot.forkliftId} onValueChange={(v) => updateAssignment(index, v)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccionar montacargas disponible" />
                  </SelectTrigger>
                  <SelectContent>
                    {available.length === 0 && (
                      <SelectItem value="__none" disabled>No hay unidades disponibles</SelectItem>
                    )}
                    {available.map((f) => (
                      <SelectItem key={f.id} value={f.id}>
                        {f.manufacturer} {f.model} — {f.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Tarifa pactada: {formatCurrency(slot.monthlyRate)} / mes · {formatCurrency(slot.dailyRate)} / día
                </p>
              </div>
            );
          })}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button
            onClick={() => onConfirm(assignments.map((a) => ({
              forkliftId: a.forkliftId,
              dailyRate: a.dailyRate,
              weeklyRate: a.weeklyRate,
              monthlyRate: a.monthlyRate,
            })))}
            disabled={!allAssigned || isLoading}
          >
            {isLoading ? "Creando reservas..." : "Confirmar y Crear Reservas"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
