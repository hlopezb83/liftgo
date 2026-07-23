import { StatusBadge } from "@/components/feedback/StatusBadge";
import { DatePickerField } from "@/components/forms/DatePickerField";
import { FormDialog, FormDialogFooter } from "@/components/forms/FormDialog";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatCurrencyWithCode } from "@/lib/format/formatCurrency";
import { formatDateDisplay } from "@/lib/utils";
import { BOOKING_STATUS_LABELS, getValidTransitions } from "../../hooks/bookingActions/useBookingActionsLogic";

interface StatusChangeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentStatus: string;
  newStatus: string;
  setNewStatus: (s: string) => void;
  onConfirm: () => void;
}

export function BookingStatusChangeDialog({
  open, onOpenChange, currentStatus, newStatus, setNewStatus, onConfirm,
}: StatusChangeDialogProps) {
  return (
    <FormDialog open={open} onOpenChange={onOpenChange} title="Cambiar Estatus de Reserva">
      <div className="space-y-4">
        <div>
          <p className="text-sm text-muted-foreground mb-1">Estatus actual</p>
          <StatusBadge status={currentStatus} />
        </div>
        <div>
          <p className="text-sm text-muted-foreground mb-1">Nuevo estatus</p>
          <Select value={newStatus} onValueChange={setNewStatus}>
            <SelectTrigger><SelectValue placeholder="Seleccionar estatus" /></SelectTrigger>
            <SelectContent>
              {getValidTransitions(currentStatus).map((s) => (
                <SelectItem key={s} value={s}>{BOOKING_STATUS_LABELS[s] || s}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <FormDialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={onConfirm} disabled={!newStatus || newStatus === currentStatus}>
            Confirmar Cambio
          </Button>
        </FormDialogFooter>
      </div>
    </FormDialog>
  );
}

interface ExtendDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentEndDate: string;
  newEndDate: Date | undefined;
  setNewEndDate: (d: Date | undefined) => void;
  extendPreview: { total: number } | null;
  isPending: boolean;
  onExtend: () => void;
}

export function BookingExtendDialog({
  open, onOpenChange, currentEndDate, newEndDate, setNewEndDate, extendPreview, isPending, onExtend,
}: ExtendDialogProps) {
  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Extender Reserva"
      description={`Fecha de fin actual: ${formatDateDisplay(currentEndDate)}`}
    >
      <div className="space-y-4">
        <DatePickerField label="Nueva Fecha de Fin" date={newEndDate} onSelect={setNewEndDate} />
        {extendPreview && (
          <div className="p-3 rounded-lg bg-muted text-sm">
            <p>Nuevo total estimado: <span className="font-bold">{formatCurrency(extendPreview.total)}</span></p>
          </div>
        )}

        <FormDialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={onExtend} disabled={isPending}>Extender</Button>
        </FormDialogFooter>
      </div>
    </FormDialog>
  );
}
