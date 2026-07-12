import { useEffect } from "react";
import { useForm, useFieldArray, useWatch } from "react-hook-form";
import { z } from "zod";
import { FormDialog, FormDialogFooter } from "@/components/forms/FormDialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Form, FormField, FormItem, FormLabel, FormControl, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { Tables } from "@/integrations/supabase/types";
import type { RentalLineMeta } from "@/lib/domain/lineItems";
import { formatCurrency } from "@/lib/format/formatCurrency";
import { zodResolver } from "@/lib/forms/zodResolver";

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

function resolveRates(line: RentalLineMeta, model: EquipmentModel | undefined) {
  return {
    daily: line.dailyRate ?? model?.default_daily_rate ?? 0,
    weekly: line.weeklyRate ?? model?.default_weekly_rate ?? 0,
    monthly: line.monthlyRate ?? model?.default_monthly_rate ?? 0,
  };
}

function buildAssignmentSlots(rentalMeta: RentalLineMeta[], models: EquipmentModel[]): AssignmentSlot[] {
  const result: AssignmentSlot[] = [];
  for (const line of rentalMeta) {
    const model = models.find((m) => m.id === line.modelId);
    const modelName = model ? `${model.manufacturer} ${model.model}` : "Equipo";
    const { daily, weekly, monthly } = resolveRates(line, model);
    for (let i = 0; i < line.quantity; i++) {
      result.push({
        modelId: line.modelId, modelName, forkliftId: "",
        dailyRate: daily, weeklyRate: weekly, monthlyRate: monthly,
      });
    }
  }
  return result;
}

const schema = z.object({
  assignments: z
    .array(
      z.object({
        modelId: z.string(),
        modelName: z.string(),
        forkliftId: z.string().min(1, "Selecciona un montacargas"),
        dailyRate: z.number(),
        weeklyRate: z.number(),
        monthlyRate: z.number(),
      }),
    )
    .min(1),
});
type FormValues = z.infer<typeof schema>;

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
  const slots = buildAssignmentSlots(rentalMeta, models);

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { assignments: slots },
    mode: "onChange",
  });
  const { fields } = useFieldArray({ control: form.control, name: "assignments" });

  useEffect(() => { form.reset({ assignments: slots }); }, [slots, form]);

  const watched = useWatch({ control: form.control, name: "assignments" });

  const getAvailableForModel = (modelId: string, currentIndex: number) => {
    const model = models.find((m) => m.id === modelId);
    if (!model) return [];
    const alreadyAssigned = new Set(
      watched.filter((a, i) => i !== currentIndex && a.forkliftId).map((a) => a.forkliftId),
    );
    return forklifts.filter(
      (f) =>
        f.status === "available" &&
        f.manufacturer === model.manufacturer &&
        f.model === model.model &&
        !alreadyAssigned.has(f.id),
    );
  };

  const onSubmit = form.handleSubmit((values) => {
    onConfirm(
      values.assignments.map((a) => ({
        forkliftId: a.forkliftId,
        dailyRate: a.dailyRate,
        weeklyRate: a.weeklyRate,
        monthlyRate: a.monthlyRate,
      })),
    );
  });

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Asignar Equipos"
      description="Selecciona el montacargas específico para cada unidad cotizada. Las tarifas pactadas en la cotización se aplicarán al equipo asignado."
    >
      <Form {...form}>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-4 max-h-[50vh] overflow-y-auto py-1">
            {fields.map((slot, index) => {
              const available = getAvailableForModel(slot.modelId, index);
              return (
                <FormField
                  key={slot.id}
                  control={form.control}
                  name={`assignments.${index}.forkliftId`}
                  render={({ field }) => (
                    <FormItem className="space-y-1.5">
                      <div className="flex items-center gap-2">
                        <FormLabel className="text-sm">{slot.modelName}</FormLabel>
                        <Badge variant="outline" className="text-xs">Unidad {index + 1}</Badge>
                      </div>
                      <Select value={field.value} onValueChange={field.onChange}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Seleccionar montacargas disponible" />
                          </SelectTrigger>
                        </FormControl>
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
                      <FormMessage />
                    </FormItem>
                  )}
                />
              );
            })}
          </div>
          <FormDialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button type="submit" disabled={!form.formState.isValid || isLoading}>
              {isLoading ? "Creando reservas..." : "Confirmar y Crear Reservas"}
            </Button>
          </FormDialogFooter>
        </form>
      </Form>
    </FormDialog>
  );
}
