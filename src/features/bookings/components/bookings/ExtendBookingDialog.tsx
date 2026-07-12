import { useState } from "react";
import { DatePickerField } from "@/components/forms/DatePickerField";
import { FormDialog, FormDialogFooter } from "@/components/forms/FormDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toYMD } from "@/lib/date/toYMD";
import { formatDateDisplay, parseDateLocal } from "@/lib/utils";
import { useCreateBookingExtension } from "../../hooks/useBookingExtensions";

interface ExtendBookingDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  bookingId: string;
  currentEndDate: string;
}

export function ExtendBookingDialog({ open, onOpenChange, bookingId, currentEndDate }: ExtendBookingDialogProps) {
  const [newEndDate, setNewEndDate] = useState<Date | undefined>(undefined);
  const [reason, setReason] = useState("");
  const createExtension = useCreateBookingExtension();

  const currentEndDateObj = (() => {
    try {
      return parseDateLocal(currentEndDate);
    } catch {
      return undefined;
    }
  })();

  const handleSubmit = () => {
    const ymd = toYMD(newEndDate);
    if (!ymd) return;
    createExtension.mutate(
      { booking_id: bookingId, original_end_date: currentEndDate, new_end_date: ymd, reason: reason || undefined },
      {
        onSuccess: () => {
          onOpenChange(false);
          setNewEndDate(undefined);
          setReason("");
        },
      },
    );
  };

  return (
    <FormDialog open={open} onOpenChange={onOpenChange} title="Extender Renta" width="md">
      <div className="space-y-4">
        <div className="space-y-1.5">
          <Label>Fecha de fin actual</Label>
          <Input value={formatDateDisplay(currentEndDate)} disabled />
        </div>
        <DatePickerField
          label="Nueva fecha de fin"
          required
          date={newEndDate}
          onSelect={setNewEndDate}
          placeholder="Selecciona una fecha"
          disabled={(date) => (currentEndDateObj ? date <= currentEndDateObj : false)}
        />
        <div className="space-y-1.5">
          <Label>Motivo (opcional)</Label>
          <Textarea placeholder="Ej: Cliente solicitó extensión por 2 semanas más..." value={reason} onChange={(e) => setReason(e.target.value)} rows={2} />
        </div>
      </div>
      <FormDialogFooter>
        <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
        <Button onClick={handleSubmit} disabled={!newEndDate || createExtension.isPending}>
          {createExtension.isPending ? "Extendiendo..." : "Confirmar Extensión"}
        </Button>
      </FormDialogFooter>
    </FormDialog>
  );
}
