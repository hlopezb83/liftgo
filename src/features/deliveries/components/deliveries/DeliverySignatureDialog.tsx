import { useEffect, useState } from "react";
import { FormDialog } from "@/components/forms/FormDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { SignaturePad } from "@/features/contracts";
import { isMissingOperationalEvidence } from "../../lib/deliveryDetailHelpers";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  hoursReading: string;
  onHoursReadingChange: (value: string) => void;
  onComplete: (signature?: string, noEvidenceReason?: string) => void;
  /** R10 Bloque 4: horómetro de la entrega para bloquear valores menores. */
  minHours?: number | null;
  /** Bug 3: operador asignado; si existe, omitir firma no requiere justificar. */
  operatorName?: string | null;
};

export function DeliverySignatureDialog({
  open,
  onOpenChange,
  hoursReading,
  onHoursReadingChange,
  onComplete,
  minHours,
  operatorName,
}: Props) {
  const parsed = hoursReading ? parseFloat(hoursReading) : NaN;
  const belowMin = Number.isFinite(parsed) && minHours != null && parsed < minHours;

  // Bug 3: completar sin firma NI operador exige una justificación breve.
  const [omitting, setOmitting] = useState(false);
  const [reason, setReason] = useState("");
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset al reabrir
    if (open) { setOmitting(false); setReason(""); }
  }, [open]);

  const handleSkipSignature = () => {
    if (belowMin) return;
    if (!isMissingOperationalEvidence(operatorName)) {
      // Hay operador asignado: el registro conserva evidencia operativa.
      onComplete();
      return;
    }
    setOmitting(true);
  };

  return (
    <FormDialog open={open} onOpenChange={onOpenChange} title="Firma del Cliente" width="lg">
      <p className="text-sm text-muted-foreground">
        Solicite la firma del cliente para confirmar la entrega.
      </p>
      <div className="space-y-1.5 mt-3">
        <Label htmlFor="hours-reading">Lectura de Horómetro (horas)</Label>
        <Input
          id="hours-reading"
          type="number"
          step="0.1"
          min={minHours ?? 0}
          placeholder={minHours != null ? `Mínimo: ${minHours}` : "Ej: 1250.5"}
          value={hoursReading}
          onChange={(e) => onHoursReadingChange(e.target.value)}
          aria-invalid={belowMin || undefined}
        />
        {minHours != null && (
          <p className={`text-xs ${belowMin ? "text-destructive" : "text-muted-foreground"}`}>
            Entrega: {minHours} h. La recolección no puede ser menor.
          </p>
        )}
      </div>
      <div className="mt-3">
        <SignaturePad onSave={(base64) => !belowMin && onComplete(base64)} />
      </div>
      {!omitting ? (
        <Button
          variant="link"
          size="sm"
          className="text-muted-foreground mt-2"
          onClick={handleSkipSignature}
          disabled={belowMin}
        >
          Omitir Firma
        </Button>
      ) : (
        <div className="mt-3 space-y-2 rounded-md border border-warning/40 bg-warning/10 p-3">
          <p className="text-sm font-medium">Se completará sin firma ni operador</p>
          <p className="text-xs text-muted-foreground">
            No hay evidencia operativa de esta entrega. Escribe quién la autorizó
            o por qué se registra así.
          </p>
          <Label htmlFor="no-evidence-reason" className="sr-only">Justificación</Label>
          <Textarea
            id="no-evidence-reason"
            rows={2}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Ej: Autorizó el supervisor Juan Pérez por teléfono"
          />
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => setOmitting(false)}>
              Volver
            </Button>
            <Button
              size="sm"
              disabled={belowMin || !reason.trim()}
              onClick={() => !belowMin && reason.trim() && onComplete(undefined, reason)}
            >
              Completar sin evidencia
            </Button>
          </div>
        </div>
      )}
    </FormDialog>
  );
}
