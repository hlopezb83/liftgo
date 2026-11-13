import { useState } from "react";
import { QueryErrorState } from "@/components/feedback/QueryErrorState";
import { useConfirm } from "@/components/feedback/useConfirm";
import { MaintenanceIcon, DeleteIcon } from "@/components/icons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatCurrency } from "@/lib/format/formatCurrency";
import { notifySuccess, notifyValidation } from "@/lib/ui/appFeedback";
import {
  useMaintenanceLabor,
  useAddMaintenanceLabor,
  useDeleteMaintenanceLabor,
} from "../../hooks/maintenance/useMaintenanceLabor";
import { useActiveMechanics } from "../../hooks/maintenance/useMechanics";

interface Props {
  maintenanceLogId: string;
  /** R12-M10: cuando el OT está `completed`, esconder el formulario de captura
   *  y deshabilitar borrado. La defensa dura sigue viva en los triggers. */
  readOnly?: boolean;
}

export function MaintenanceLaborSection({ maintenanceLogId, readOnly = false }: Props) {
  const mechanicsQuery = useActiveMechanics();
  const { data: mechanics = [] } = mechanicsQuery;
  const laborQuery = useMaintenanceLabor(maintenanceLogId);
  const { data: labor = [], isLoading } = laborQuery;
  const addLabor = useAddMaintenanceLabor();
  const deleteLabor = useDeleteMaintenanceLabor();
  const confirm = useConfirm();

  const [mechanicId, setMechanicId] = useState<string>("");
  const [hours, setHours] = useState<string>("");
  const [hourlyRate, setHourlyRate] = useState<string>("");
  const [notes, setNotes] = useState<string>("");

  const laborTotal = labor.reduce((sum, l) => sum + Number(l.total_cost ?? 0), 0);
  const captureBlocked = captureQueriesUnavailable(laborQuery, mechanicsQuery);

  const handleAdd = () => {
    if (readOnly || addLabor.isPending || captureBlocked) return;
    const h = Number(hours);
    const r = Number(hourlyRate);
    if (!mechanicId) return notifyValidation({ message: "Selecciona un mecánico" });
    if (!Number.isFinite(h) || h <= 0) return notifyValidation({ message: "Horas debe ser mayor a 0" });
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
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
            <Select value={mechanicId} onValueChange={setMechanicId} disabled={mechanicsQuery.isError || mechanicsQuery.isLoading || addLabor.isPending}>
              <SelectTrigger className="sm:col-span-2">
                <SelectValue placeholder="Mecánico" />
              </SelectTrigger>
              <SelectContent>
                {mechanics.map((m) => (
                  <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              type="number" min="0" step="0.25" placeholder="Horas"
              value={hours} onChange={(e) => setHours(e.target.value)}
            />
            <Input
              type="number" min="0" step="0.01" placeholder="Tarifa/hr"
              value={hourlyRate} onChange={(e) => setHourlyRate(e.target.value)}
            />
          </div>
          <div className="flex gap-2">
            <Input
              placeholder="Notas (opcional)"
              value={notes} onChange={(e) => setNotes(e.target.value)}
            />
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

function captureQueriesUnavailable(labor: ReturnType<typeof useMaintenanceLabor>, mechanics: ReturnType<typeof useActiveMechanics>) {
  return labor.isLoading || labor.isError || mechanics.isLoading || mechanics.isError;
}
