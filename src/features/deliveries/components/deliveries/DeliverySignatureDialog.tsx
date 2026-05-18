import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CheckCircle } from "lucide-react";
import { SignaturePad } from "@/features/contracts/components/contracts/SignaturePad";

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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CheckCircle className="h-5 w-5 text-primary" /> Firma del Cliente
          </DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          Solicite la firma del cliente para confirmar la entrega.
        </p>
        <div className="space-y-1.5">
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
        <SignaturePad onSave={(base64) => onComplete(base64)} />
        <Button
          variant="link"
          size="sm"
          className="text-muted-foreground"
          onClick={() => onComplete()}
        >
          Omitir Firma
        </Button>
      </DialogContent>
    </Dialog>
  );
}
