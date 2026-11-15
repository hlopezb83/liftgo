import { useEffect, useId, useRef, useState, type Ref } from "react";
import { QueryErrorState } from "@/components/feedback/QueryErrorState";
import { useConfirm } from "@/components/feedback/useConfirm";
import { MaintenanceIcon, DeleteIcon } from "@/components/icons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useHasModuleAccess } from "@/features/users";
import { formatCurrency } from "@/lib/format/formatCurrency";
import { Link } from "@/lib/router-compat-ui";
import { notifySuccess, notifyValidation } from "@/lib/ui/appFeedback";
import {
  useMaintenanceLabor,
  useAddMaintenanceLabor,
  useDeleteMaintenanceLabor,
} from "../../hooks/maintenance/useMaintenanceLabor";
import { useActiveMechanics } from "../../hooks/maintenance/useMechanics";
import type { LaborDraftState } from "../../hooks/maintenance/useLaborDraftGuard";

interface Props {
  maintenanceLogId: string;
  /** R12-M10: cuando el OT está `completed`, esconder el formulario de captura
   *  y deshabilitar borrado. La defensa dura sigue viva en los triggers. */
  readOnly?: boolean;
  onDraftChange?: (state: LaborDraftState) => void;
}

function MechanicsEmptyState() {
  const canManageMechanics = useHasModuleAccess("Configuración", "full");
  return (
    <div className="space-y-2 rounded-md border bg-muted/30 p-3 text-sm">
      <p>No hay mecánicos activos. {canManageMechanics
        ? "Da de alta o activa uno en la pestaña Mecánicos de Configuración."
        : "Solicita a un administrador que dé de alta o active uno."}</p>
      {canManageMechanics && <Button asChild variant="outline" size="sm"><Link to="/settings/operations">Ir a Configuración</Link></Button>}
    </div>
  );
}

function LaborHoursAndRateFields({ fieldId, inputRef, value, invalid, onChange, hourlyRate, onRateChange }: {
  fieldId: string;
  inputRef: Ref<HTMLInputElement>;
  value: string;
  invalid: boolean;
  onChange: (value: string) => void;
  hourlyRate: string;
  onRateChange: (value: string) => void;
}) {
  return (
    <>
      <div className="space-y-1">
        <Label htmlFor={`${fieldId}-hours`} className="text-xs">Horas</Label>
        <Input
          ref={inputRef}
          id={`${fieldId}-hours`}
          type="number" min="0" step="0.25" placeholder="Horas"
          aria-invalid={invalid || undefined}
          aria-describedby={invalid ? `${fieldId}-hours-error` : undefined}
          className={invalid ? "border-destructive focus-visible:ring-destructive" : undefined}
          value={value} onChange={(e) => onChange(e.target.value)}
        />
      </div>
      {invalid && (
        <p id={`${fieldId}-hours-error`} role="alert" className="text-xs text-destructive sm:col-start-3 sm:col-span-2 sm:row-start-2">
          Ingresa más de 0 horas
        </p>
      )}
      <div className="space-y-1 sm:col-start-4 sm:row-start-1">
        <Label htmlFor={`${fieldId}-rate`} className="text-xs">Tarifa por hora (MXN)</Label>
        <Input
          id={`${fieldId}-rate`}
          type="number" min="0" step="0.01" placeholder="Tarifa/hr"
          value={hourlyRate} onChange={(e) => onRateChange(e.target.value)}
        />
      </div>
    </>
  );
}

export function MaintenanceLaborSection({ maintenanceLogId, readOnly = false, onDraftChange }: Props) {
  const fieldId = useId();
  const mechanicsQuery = useActiveMechanics();
  const { data: mechanics = [] } = mechanicsQuery;
  const laborQuery = useMaintenanceLabor(maintenanceLogId);
  const { data: labor = [], isLoading } = laborQuery;
  const addLabor = useAddMaintenanceLabor();
  const deleteLabor = useDeleteMaintenanceLabor();
  const confirm = useConfirm();

  const [mechanicId, setMechanicId] = useState<string>("");
  const [hours, setHours] = useState<string>("");
  const [hoursInvalid, setHoursInvalid] = useState(false);
  const hoursRef = useRef<HTMLInputElement>(null);
  const [hourlyRate, setHourlyRate] = useState<string>("");
  const [notes, setNotes] = useState<string>("");

  const dirty = !readOnly && [mechanicId, hours, hourlyRate, notes].some(Boolean);
  useEffect(() => {
    onDraftChange?.({ dirty, pending: addLabor.isPending });
  }, [dirty, addLabor.isPending, onDraftChange]);

  const laborTotal = labor.reduce((sum, l) => sum + Number(l.total_cost ?? 0), 0);
  const { empty: mechanicsEmpty, unavailable: mechanicsUnavailable } = mechanicsAvailability(mechanicsQuery);
  const captureBlocked = captureQueriesUnavailable(laborQuery, mechanicsUnavailable);

  const handleAdd = () => {
    if (readOnly || addLabor.isPending || captureBlocked) return;
    const h = Number(hours);
    const r = Number(hourlyRate);
    if (!mechanicId) return notifyValidation({ message: "Selecciona un mecánico" });
    if (!Number.isFinite(h) || h <= 0) {
      setHoursInvalid(true);
      hoursRef.current?.focus();
      return notifyValidation({ message: "Horas debe ser mayor a 0" });
    }
    if (!Number.isFinite(r) || r < 0) return notifyValidation({ message: "Tarifa inválida" });
    addLabor.mutate(
      {
        maintenance_log_id: maintenanceLogId,
        mechanic_id: mechanicId,
        hours: h,
        hourly_rate: r,
        notes: notes.trim() || null,
      },
      {
        onSuccess: () => {
          notifySuccess("Mano de obra registrada");
          setMechanicId("");
          setHours("");
          setHoursInvalid(false);
          setHourlyRate("");
          setNotes("");
        },
      },
    );
  };

  const handleDelete = async (id: string) => {
    if (readOnly || deleteLabor.isPending || laborQuery.isError || isLoading) return;
    const ok = await confirm({
      title: "¿Eliminar mano de obra?",
      description: "El costo asociado se retirará del total del servicio. Esta acción no se puede deshacer.",
      confirmLabel: "Eliminar",
      destructive: true,
    });
    if (!ok) return;
    deleteLabor.mutate(id, { onSuccess: () => notifySuccess("Registro eliminado") });
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <MaintenanceIcon className="h-4 w-4 text-muted-foreground" />
        <h4 className="font-semibold text-sm">Mano de Obra</h4>
        {!laborQuery.isError && laborTotal > 0 && (
          <Badge variant="secondary" className="ml-auto">{formatCurrency(laborTotal)}</Badge>
        )}
      </div>

      {!readOnly && (
        <fieldset disabled={addLabor.isPending} className="space-y-2">
          {mechanicsQuery.isError && <QueryErrorState bare entity="los mecánicos" error={mechanicsQuery.error}
            isRetrying={mechanicsQuery.isFetching} onRetry={() => { void mechanicsQuery.refetch(); }} />}
          {mechanicsEmpty && <MechanicsEmptyState />}
          <div className="grid grid-cols-1 sm:grid-cols-4 items-end gap-2">
            <div className="space-y-1 sm:col-span-2">
            <Label htmlFor={`${fieldId}-mechanic`} className="text-xs">Mecánico</Label>
            <Select value={mechanicId} onValueChange={setMechanicId} disabled={mechanicsUnavailable || addLabor.isPending}>
              <SelectTrigger id={`${fieldId}-mechanic`}>
                <SelectValue placeholder="Mecánico" />
              </SelectTrigger>
              <SelectContent>
                {mechanics.map((m) => (
                  <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            </div>
            <LaborHoursAndRateFields
              fieldId={fieldId} inputRef={hoursRef}
              value={hours} invalid={hoursInvalid}
              hourlyRate={hourlyRate} onRateChange={setHourlyRate}
              onChange={(value) => {
                setHours(value);
                if (Number.isFinite(Number(value)) && Number(value) > 0) setHoursInvalid(false);
              }}
            />
          </div>
          <div className="flex items-end gap-2">
            <div className="min-w-0 flex-1 space-y-1">
            <Label htmlFor={`${fieldId}-notes`} className="text-xs">Notas (opcional)</Label>
            <Input
              id={`${fieldId}-notes`}
              placeholder="Notas (opcional)"
              value={notes} onChange={(e) => setNotes(e.target.value)}
            />
            </div>
            <Button onClick={handleAdd} disabled={addLabor.isPending || captureBlocked} size="sm">Agregar</Button>
          </div>
        </fieldset>
      )}

      {laborQuery.isError ? <QueryErrorState bare entity="la mano de obra" error={laborQuery.error}
        isRetrying={laborQuery.isFetching} onRetry={() => { void laborQuery.refetch(); }} /> : isLoading ? (
        <p className="text-sm text-muted-foreground">Cargando…</p>
      ) : labor.length === 0 ? (
        <p className="text-sm text-muted-foreground italic">Sin mano de obra registrada.</p>
      ) : (
        <div className="border rounded-md divide-y">
          {labor.map((l) => (
            <div key={l.id} className="flex flex-col px-3 py-2 text-sm gap-2">
              <div className="flex flex-col min-w-0">
                <span className="font-medium break-words">{l.mechanics?.name ?? "Mecánico"}</span>
                {l.notes && <span className="text-xs text-muted-foreground break-words">{l.notes}</span>}
              </div>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-muted-foreground">
                <span>{Number(l.hours)}h × {formatCurrency(Number(l.hourly_rate))}</span>
                <span className="font-mono text-foreground">{formatCurrency(Number(l.total_cost ?? 0))}</span>
                {!readOnly && (
                  <Button
                    variant="ghost" size="icon"
                    aria-label={`Eliminar mano de obra de ${l.mechanics?.name ?? "mecánico"}`}
                    onClick={() => handleDelete(l.id)}
                    disabled={deleteLabor.isPending}
                  >
                    <DeleteIcon className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function mechanicsAvailability(mechanics: ReturnType<typeof useActiveMechanics>) {
  const empty = mechanics.isSuccess && mechanics.data.length === 0;
  return { empty, unavailable: mechanics.isLoading || mechanics.isError || empty };
}

function captureQueriesUnavailable(labor: ReturnType<typeof useMaintenanceLabor>, mechanicsUnavailable: boolean) {
  return labor.isLoading || labor.isError || mechanicsUnavailable;
}
