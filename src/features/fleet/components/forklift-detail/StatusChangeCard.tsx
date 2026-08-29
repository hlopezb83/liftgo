import { useState } from "react";
import { BlockedActionNotice } from "@/components/feedback/BlockedActionNotice";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FORKLIFT_STATUSES, STATUS_LABELS } from "@/lib/constants";
import { describeForkliftRentalBlock, type BusinessBlock } from "@/lib/rules/businessBlocks";
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
/** Destinos que el backend bloquea mientras la unidad tenga renta activa. */
const BLOCKED_WHILE_RENTED = new Set(["maintenance", "available", "sold", "retired"]);

export function StatusChangeCard({ forkliftId, currentStatus }: StatusChangeCardProps) {
  const [newStatus, setNewStatus] = useState("");
  const [statusNote, setStatusNote] = useState("");
  // Bloqueo devuelto por el backend cuando la UI no lo pudo anticipar (carrera).
  const [serverBlock, setServerBlock] = useState<BusinessBlock | null>(null);
  const updateStatus = useUpdateStatus({ onBusinessBlock: setServerBlock });

  const reasonRequired = REASON_REQUIRED.has(newStatus);
  // Prevención en UI: la regla la impone `change_forklift_status`, aquí solo
  // se explica de antemano cuando el estado actual ya la determina.
  const rentedBlock =
    currentStatus === "rented" && BLOCKED_WHILE_RENTED.has(newStatus)
      ? describeForkliftRentalBlock(newStatus)
      : null;
  // Si el backend rechazó por renta activa (carrera), se muestra el mismo
  // bloqueo pero titulado con el estado que el usuario intentó aplicar.
  const contextualServerBlock =
    serverBlock?.code === "forklift_active_rental"
      ? describeForkliftRentalBlock(newStatus)
      : serverBlock;
  const block = rentedBlock ?? contextualServerBlock;
  const canSubmit =
    !!newStatus &&
    newStatus !== currentStatus &&
    !rentedBlock &&
    (!reasonRequired || statusNote.trim().length > 0) &&
    !updateStatus.isPending;

  const handleStatusChange = () => {
    if (!canSubmit) return;
    setServerBlock(null);
    updateStatus.mutate(
      { forkliftId, fromStatus: currentStatus, toStatus: newStatus, note: statusNote || undefined },
      {
        onSuccess: () => { notifySuccess("Estado actualizado"); setNewStatus(""); setStatusNote(""); },
      },
    );
  };

  return (
    <Card>
      <CardHeader className="pb-3"><CardTitle className="text-base">Cambiar Estado</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <div className="flex gap-3 items-end flex-wrap">
          <Select value={newStatus} onValueChange={(v) => { setNewStatus(v); setServerBlock(null); }}>
            <SelectTrigger className="flex-1 max-w-xs" aria-label="Nuevo estado del montacargas"><SelectValue placeholder="Seleccionar nuevo estado" /></SelectTrigger>
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
            aria-label="Razón del cambio de estado"
          />
          <Button onClick={handleStatusChange} disabled={!canSubmit} size="sm">Actualizar Estado</Button>
        </div>
        {block && <BlockedActionNotice block={block} />}
      </CardContent>
    </Card>
  );
}

