import { FormDialog } from "@/components/forms/FormDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SignaturePad } from "@/features/contracts";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  hoursReading: string;
  onHoursReadingChange: (value: string) => void;
  onComplete: (signature?: string) => void;
  /** R10 Bloque 4: horómetro de la entrega para bloquear valores menores. */
  minHours?: number | null;
};

export function DeliverySignatureDialog({
  open,
  onOpenChange,
  hoursReading,
  onHoursReadingChange,
  onComplete,
  minHours,
}: Props) {
  const parsed = hoursReading ? parseFloat(hoursReading) : NaN;
  const belowMin = Number.isFinite(parsed) && minHours != null && parsed < minHours;
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
      <Button
        variant="link"
        size="sm"
        className="text-muted-foreground mt-2"
        onClick={() => !belowMin && onComplete()}
        disabled={belowMin}
      >
        Omitir Firma
      </Button>
    </FormDialog>
  );
}

