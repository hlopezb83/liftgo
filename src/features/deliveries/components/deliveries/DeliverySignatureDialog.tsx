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
};

export function DeliverySignatureDialog({
  open,
  onOpenChange,
  hoursReading,
  onHoursReadingChange,
  onComplete,
}: Props) {
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
          min="0"
          placeholder="Ej: 1250.5"
          value={hoursReading}
          onChange={(e) => onHoursReadingChange(e.target.value)}
        />
      </div>
      <div className="mt-3">
        <SignaturePad onSave={(base64) => onComplete(base64)} />
      </div>
      <Button
        variant="link"
        size="sm"
        className="text-muted-foreground mt-2"
        onClick={() => onComplete()}
      >
        Omitir Firma
      </Button>
    </FormDialog>
  );
}
