import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FORKLIFT_STATUSES, STATUS_LABELS } from "@/lib/constants";
import { notifySuccess } from "@/lib/ui/appFeedback";
import { useUpdateStatus } from "../../hooks/forklifts/useForklifts";

interface StatusChangeCardProps {
  forkliftId: string;
  currentStatus: string;
}

// R8 Bloque 3: 'rented' se deriva del sistema (rentas activas) y no se ofrece como
// destino manual; y para maintenance/sold/retired la razón es obligatoria.
const REASON_REQUIRED = new Set(["maintenance", "sold", "retired"]);
const MANUAL_TARGETS = FORKLIFT_STATUSES.filter((s) => s !== "rented");

export function StatusChangeCard({ forkliftId, currentStatus }: StatusChangeCardProps) {
  const updateStatus = useUpdateStatus();
  const [newStatus, setNewStatus] = useState("");
  const [statusNote, setStatusNote] = useState("");

  const reasonRequired = REASON_REQUIRED.has(newStatus);
  const canSubmit =
    !!newStatus &&
    newStatus !== currentStatus &&
    (!reasonRequired || statusNote.trim().length > 0) &&
    !updateStatus.isPending;

  const handleStatusChange = () => {
    if (!canSubmit) return;
    updateStatus.mutate(
      { forkliftId, fromStatus: currentStatus, toStatus: newStatus, note: statusNote || undefined },
      { onSuccess: () => { notifySuccess("Estado actualizado"); setNewStatus(""); setStatusNote(""); } },
    );
  };

  return (
    <Card>
      <CardHeader className="pb-3"><CardTitle className="text-base">Cambiar Estado</CardTitle></CardHeader>
      <CardContent className="flex gap-3 items-end flex-wrap">
        <Select value={newStatus} onValueChange={setNewStatus}>
          <SelectTrigger className="flex-1 max-w-xs"><SelectValue placeholder="Seleccionar nuevo estado" /></SelectTrigger>
          <SelectContent>
            {MANUAL_TARGETS.filter((s) => s !== currentStatus).map((s) => (
              <SelectItem key={s} value={s}>{STATUS_LABELS[s] || s}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          placeholder={reasonRequired ? "Razón del cambio (obligatoria)" : "Razón del cambio (opcional)"}
          value={statusNote}
          onChange={(e) => setStatusNote(e.target.value)}
          className="flex-1 max-w-xs"
          aria-required={reasonRequired}
        />
        <Button onClick={handleStatusChange} disabled={!canSubmit} size="sm">Actualizar Estado</Button>
      </CardContent>
    </Card>
  );
}
