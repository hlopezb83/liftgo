import { StatusBadge } from "@/components/feedback/StatusBadge";
import { DatePickerField } from "@/components/forms/DatePickerField";
import { FormDialog, FormDialogFooter } from "@/components/forms/FormDialog";
import { FormDialogCancelButton } from "@/components/forms/FormDialogCancelButton";
import { WarnIcon } from "@/components/icons";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { formatDateMty } from "@/lib/format/dateFormats";
import { formatCurrencyWithCode } from "@/lib/format/formatCurrency";
import { formatDateRange } from "@/lib/utils";
import { BOOKING_STATUS_LABELS, getValidTransitions } from "../../hooks/bookingActions/useBookingActionsLogic";
import type { BookingWithForklift } from "../../hooks/bookings/useBookings";
import type { ComponentProps } from "react";

interface StatusChangeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentStatus: string;
  newStatus: string;
  setNewStatus: (s: string) => void;
  onConfirm: () => void;
  onCloseAutoFocus?: ComponentProps<typeof FormDialog>["onCloseAutoFocus"];
}

export function BookingStatusChangeDialog({
  open, onOpenChange, currentStatus, newStatus, setNewStatus, onConfirm, onCloseAutoFocus,
}: StatusChangeDialogProps) {
  return (
    <FormDialog open={open} onOpenChange={onOpenChange} title="Cambiar Estatus de Reserva" onCloseAutoFocus={onCloseAutoFocus}>
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
        {/* D3-r3: la advertencia FE2-12 queda como nota — la acción "Completar"
            se retiró del selector; el cierre siempre ocurre en Devoluciones. */}
        {currentStatus === "confirmed" && (
          <Alert>
            <WarnIcon className="h-4 w-4" />
            <AlertDescription>
              Para completar una renta usa el flujo de Devoluciones y Revisión:
              la inspección del retorno es quien marca la reserva como completada
              y libera el montacargas.
            </AlertDescription>
          </Alert>
        )}

        <FormDialogFooter>
          <FormDialogCancelButton onCancel={() => onOpenChange(false)} />
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
  extendPreview: { total: number; currency: string } | null;
  isPending: boolean;
  onExtend: () => void;
}

export function BookingExtendDialog({
  open, onOpenChange, currentEndDate, newEndDate, setNewEndDate, extendPreview, isPending, onExtend,
}: ExtendDialogProps) {
  return (
    <FormDialog
      isPending={isPending}
      open={open}
      onOpenChange={onOpenChange}
      title="Extender Reserva"
      description={`Fecha de fin actual: ${formatDateMty(currentEndDate)}`}
    >
      <div className="space-y-4">
        <DatePickerField label="Nueva Fecha de Fin" date={newEndDate} onSelect={setNewEndDate} />
        {extendPreview && (
          <div className="p-3 rounded-lg bg-muted text-sm">
            <p>Cargo adicional estimado: <span className="font-bold">{formatCurrencyWithCode(extendPreview.total, extendPreview.currency)}</span></p>
          </div>
        )}

        <FormDialogFooter>
          <FormDialogCancelButton onCancel={() => onOpenChange(false)} />
          <Button onClick={onExtend} disabled={isPending}>Extender</Button>
        </FormDialogFooter>
      </div>
    </FormDialog>
  );
}

interface CancelBookingDialogProps {
  booking: BookingWithForklift;
  open: boolean;
  reason: string;
  isPending: boolean;
  onOpenChange: (open: boolean) => void;
  onReasonChange: (reason: string) => void;
  onConfirm: () => void;
  onCloseAutoFocus?: (event: Event) => void;
}

export function CancelBookingDialog({
  booking, open, reason, isPending, onOpenChange, onReasonChange, onConfirm, onCloseAutoFocus,
}: CancelBookingDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md" onCloseAutoFocus={onCloseAutoFocus}>
        <DialogHeader>
          <DialogTitle>¿Cancelar esta reserva?</DialogTitle>
          <DialogDescription>
            Se cancelará la reserva de {booking.customer_name || "este cliente"} ({formatDateRange(booking.start_date, booking.end_date)}). Esta acción no se puede deshacer.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="cancel-reason">Motivo (opcional)</Label>
          <Textarea
            id="cancel-reason"
            value={reason}
            onChange={(event) => onReasonChange(event.target.value)}
            placeholder="Ej. cliente reprogramó, cambio de equipo, error de captura…"
            rows={3}
            maxLength={500}
          />
          <p className="text-xs text-muted-foreground">Se registrará en la bitácora del equipo.</p>
        </div>
        <DialogFooter>
          <Button variant="outline" disabled={isPending} onClick={() => onOpenChange(false)}>Volver</Button>
          <Button variant="destructive" disabled={isPending} onClick={onConfirm}>Cancelar Reserva</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
