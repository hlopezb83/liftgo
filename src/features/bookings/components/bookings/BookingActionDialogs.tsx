import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DatePickerField } from "@/components/forms/DatePickerField";
import { StatusBadge } from "@/components/feedback/StatusBadge";
import { formatCurrency } from "@/lib/formatCurrency";
import { formatDateDisplay } from "@/lib/utils";
import { STATUS_LABELS, getValidTransitions } from "@/features/bookings/hooks/useBookingActionsLogic";

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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>Cambiar Estatus de Reserva</DialogTitle></DialogHeader>
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
                  <SelectItem key={s} value={s}>{STATUS_LABELS[s] || s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex gap-3">
            <Button onClick={onConfirm} disabled={!newStatus || newStatus === currentStatus}>
              Confirmar Cambio
            </Button>
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>Extender Reserva</DialogTitle></DialogHeader>
        <p className="text-sm text-muted-foreground">Fecha de fin actual: {formatDateDisplay(currentEndDate)}</p>
        <DatePickerField label="Nueva Fecha de Fin" date={newEndDate} onSelect={setNewEndDate} />
        {extendPreview && (
          <div className="p-3 rounded-lg bg-muted text-sm">
            <p>Nuevo total estimado: <span className="font-bold">{formatCurrency(extendPreview.total)}</span></p>
          </div>
        )}
        <div className="flex gap-3">
          <Button onClick={onExtend} disabled={isPending}>Extender</Button>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
