import { parseISO } from "date-fns";
import { useEffect, useMemo } from "react";
import { useForm, useFieldArray, useWatch } from "react-hook-form";
import { z } from "zod";
import { FormDialog, FormDialogFooter } from "@/components/forms/FormDialog";
import { FormDialogCancelButton } from "@/components/forms/FormDialogCancelButton";
import { WarnIcon } from "@/components/icons";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Form, FormField, FormItem, FormLabel, FormControl, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { computeFleetAvailability, useServerTodayMty } from "@/features/availability";
import { useBookings } from "@/features/bookings";
import { useAvailableForklifts } from "@/features/fleet";
import type { Tables } from "@/integrations/supabase/types";
import type { RentalLineMeta } from "@/lib/domain/lineItems";
import { formatCurrency } from "@/lib/format/formatCurrency";
import { zodResolver } from "@/lib/forms/zodResolver";

type Forklift = Tables<"forklifts">;
type EquipmentModel = Tables<"equipment_models">;

/** Estados en los que una unidad NO puede asignarse a una cotización. */
const BLOCKED_STATUSES = new Set(["maintenance", "retired", "sold", "out_of_service"]);


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
  startDate: string | null;
  endDate: string | null;
  rentalMeta: RentalLineMeta[];
  models: EquipmentModel[];
  forklifts: Forklift[];
  onConfirm: (assignments: AssignmentResult[]) => void;
  isLoading?: boolean;
}

export function EquipmentAssignmentDialog({
  open, onOpenChange, startDate, endDate, rentalMeta, models, forklifts, onConfirm, isLoading,
}: EquipmentAssignmentDialogProps) {
  const slots = buildAssignmentSlots(rentalMeta, models);
  // H11: reusar la RPC get_available_forklifts con la ventana de la cotización
  // para no ofrecer unidades con OT en curso o dentro del buffer de mantenimiento
  // (create_booking las rechazaría al confirmar).
  const { availableForklifts, datesSelected } = useAvailableForklifts(
    startDate && endDate ? { from: parseISO(startDate), to: parseISO(endDate) } : undefined,
  );
  const rpcAvailableIds = datesSelected ? new Set(availableForklifts.map((f) => f.id)) : null;
  // FIX A5: el `status` crudo se desincroniza (unidades `rented` cuya reserva
  // ya terminó y nadie cerró la devolución). Antes quedaban fuera del selector
  // aunque estuvieran libres. Usamos la misma definición operativa que Flota:
  // los estados explícitos (maintenance/retired/sold/out_of_service) mandan y
  // el resto se valida contra la RPC de disponibilidad de la ventana elegida.
  const { data: assignmentBookings } = useBookings();
  const todayYmd = useServerTodayMty();
  const rentedIds = useMemo(
    () =>
      assignmentBookings
        ? computeFleetAvailability(forklifts, assignmentBookings, todayYmd)?.rentedForkliftIds
        : undefined,
    [forklifts, assignmentBookings, todayYmd],
  );
  const isSelectable = (f: Forklift) => {
    if (BLOCKED_STATUSES.has(f.status)) return false;
    if (rpcAvailableIds) return true; // la RPC ya validó la ventana de fechas
    return rentedIds ? !rentedIds.has(f.id) : f.status === "available";
  };


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
        isSelectable(f) &&
        (!rpcAvailableIds || rpcAvailableIds.has(f.id)) &&
        f.manufacturer === model.manufacturer &&
        f.model === model.model &&
        !alreadyAssigned.has(f.id),
    );

  };

  // Feedback anticipado: cuántas unidades ya tienen equipo y qué modelos se
  // quedaron sin disponibilidad (antes sólo se veía al abrir cada selector).
  const assignedCount = (watched ?? []).filter((a) => a.forkliftId).length;
  const modelsWithoutStock = Array.from(
    new Set(
      fields
        .map((slot, index) => (getAvailableForModel(slot.modelId, index).length === 0 ? slot.modelName : null))
        .filter((n): n is string => !!n),
    ),
  );

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
      isPending={isLoading}
      open={open}
      onOpenChange={onOpenChange}
      title="Asignar equipos"
      description="Selecciona el montacargas específico para cada unidad cotizada. Las tarifas pactadas en la cotización se aplicarán al equipo asignado."
    >
      <Form {...form}>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="flex items-center justify-between rounded-md border bg-muted/30 px-3 py-2">
            <span className="text-sm text-muted-foreground">Unidades asignadas</span>
            <span className="text-sm font-semibold">{assignedCount} de {fields.length}</span>
          </div>

          {modelsWithoutStock.length > 0 && (
            <Alert variant="destructive">
              <WarnIcon className="h-4 w-4" />
              <AlertDescription>
                Sin unidades disponibles para: {modelsWithoutStock.join(", ")}. Libera un equipo o
                cambia su estatus a “Disponible” en Flota para poder crear la reserva.
              </AlertDescription>
            </Alert>
          )}

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
                      {available.length === 0 ? (
                        <p className="text-sm text-muted-foreground py-2">No hay unidades disponibles</p>
                      ) : (
                        <Select value={field.value} onValueChange={field.onChange}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Seleccionar montacargas disponible" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {available.map((f) => (
                              <SelectItem key={f.id} value={f.id}>
                                {f.manufacturer} {f.model} — {f.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
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
            <FormDialogCancelButton onCancel={() => onOpenChange(false)} disabled={isLoading} />
            <Button type="submit" disabled={!form.formState.isValid || isLoading}>
              {isLoading ? "Creando reservas…" : "Confirmar y Crear reservas"}
            </Button>
          </FormDialogFooter>
        </form>
      </Form>
    </FormDialog>
  );
}
