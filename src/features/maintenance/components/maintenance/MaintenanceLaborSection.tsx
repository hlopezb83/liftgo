import { useState } from "react";
import { MaintenanceIcon, DeleteIcon } from "@/components/icons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useActiveMechanics } from "../../hooks/maintenance/useMechanics";
import {
  useMaintenanceLabor,
  useAddMaintenanceLabor,
  useDeleteMaintenanceLabor,
} from "../../hooks/maintenance/useMaintenanceLabor";
import { formatCurrency } from "@/lib/format/formatCurrency";
import { notifySuccess, notifyValidation } from "@/lib/ui/appFeedback";

interface Props {
  maintenanceLogId: string;
}

export function MaintenanceLaborSection({ maintenanceLogId }: Props) {
  const { data: mechanics = [] } = useActiveMechanics();
  const { data: labor = [], isLoading } = useMaintenanceLabor(maintenanceLogId);
  const addLabor = useAddMaintenanceLabor();
  const deleteLabor = useDeleteMaintenanceLabor();

  const [mechanicId, setMechanicId] = useState<string>("");
  const [hours, setHours] = useState<string>("");
  const [hourlyRate, setHourlyRate] = useState<string>("");
  const [notes, setNotes] = useState<string>("");

  const laborTotal = labor.reduce((sum, l) => sum + Number(l.total_cost ?? 0), 0);

  const handleAdd = () => {
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

  const handleDelete = (id: string) => {
    deleteLabor.mutate(id, { onSuccess: () => notifySuccess("Registro eliminado") });
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <MaintenanceIcon className="h-4 w-4 text-muted-foreground" />
        <h4 className="font-semibold text-sm">Mano de Obra</h4>
        {laborTotal > 0 && (
          <Badge variant="secondary" className="ml-auto">{formatCurrency(laborTotal)}</Badge>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
        <Select value={mechanicId} onValueChange={setMechanicId}>
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
        <Button onClick={handleAdd} disabled={addLabor.isPending} size="sm">Agregar</Button>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Cargando...</p>
      ) : labor.length === 0 ? (
        <p className="text-sm text-muted-foreground italic">Sin mano de obra registrada.</p>
      ) : (
        <div className="border rounded-md divide-y">
          {labor.map((l) => (
            <div key={l.id} className="flex items-center justify-between px-3 py-2 text-sm gap-3">
              <div className="flex flex-col min-w-0">
                <span className="font-medium truncate">{l.mechanics?.name ?? "Mecánico"}</span>
                {l.notes && <span className="text-xs text-muted-foreground truncate">{l.notes}</span>}
              </div>
              <div className="flex items-center gap-3 text-muted-foreground shrink-0">
                <span>{Number(l.hours)}h × {formatCurrency(Number(l.hourly_rate))}</span>
                <span className="font-mono text-foreground">{formatCurrency(Number(l.total_cost ?? 0))}</span>
                <Button
                  variant="ghost" size="icon"
                  aria-label="Eliminar"
                  onClick={() => handleDelete(l.id)}
                  disabled={deleteLabor.isPending}
                >
                  <DeleteIcon className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
