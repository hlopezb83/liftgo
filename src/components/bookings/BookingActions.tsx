import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DatePickerField } from "@/components/DatePickerField";
import { StatusBadge } from "@/components/StatusBadge";
import { formatCurrency } from "@/lib/formatCurrency";
import { type BookingWithForklift } from "@/hooks/useBookings";
import { CalendarPlus, Undo2, XCircle, FileText, Trash2, RefreshCw } from "lucide-react";
import { formatDateDisplay } from "@/lib/utils";
import { useBookingActionsLogic, STATUS_LABELS, getValidTransitions } from "@/hooks/useBookingActionsLogic";

interface BookingActionsProps { booking: BookingWithForklift; }

function ConfirmActionDialog({
  trigger, title, description, confirmLabel, onConfirm,
}: {
  trigger: React.ReactNode;
  title: string;
  description: string;
  confirmLabel: string;
  onConfirm: () => void;
}) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>{trigger}</AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
            {confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export function BookingActions({ booking }: BookingActionsProps) {
  const {
    isAdmin, navigate,
    extendOpen, setExtendOpen,
    statusDialogOpen, setStatusDialogOpen,
    newStatus, setNewStatus,
    newEndDate, setNewEndDate,
    extendPreview,
    handleDelete, handleCancel, handleStatusChange, handleExtend,
    updateBookingPending,
  } = useBookingActionsLogic(booking);

  const statusChangeDialog = (
    <Dialog open={statusDialogOpen} onOpenChange={setStatusDialogOpen}>
      <DialogContent>
        <DialogHeader><DialogTitle>Cambiar Estatus de Reserva</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div>
            <p className="text-sm text-muted-foreground mb-1">Estatus actual</p>
            <StatusBadge status={booking.status} />
          </div>
          <div>
            <p className="text-sm text-muted-foreground mb-1">Nuevo estatus</p>
            <Select value={newStatus} onValueChange={setNewStatus}>
              <SelectTrigger><SelectValue placeholder="Seleccionar estatus" /></SelectTrigger>
              <SelectContent>
                {getValidTransitions(booking.status).map((s) => (
                  <SelectItem key={s} value={s}>{STATUS_LABELS[s] || s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex gap-3">
            <Button onClick={handleStatusChange} disabled={!newStatus || newStatus === booking.status}>
              Confirmar Cambio
            </Button>
            <Button variant="outline" onClick={() => setStatusDialogOpen(false)}>Cancelar</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );

  const deleteButton = (
    <ConfirmActionDialog
      trigger={
        <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive">
          <Trash2 className="h-3.5 w-3.5 mr-1" />Eliminar
        </Button>
      }
      title="¿Eliminar esta reserva?"
      description={`Se eliminará permanentemente la reserva de ${booking.customer_name || "este cliente"}. Esta acción no se puede deshacer.`}
      confirmLabel="Eliminar"
      onConfirm={handleDelete}
    />
  );

  if (booking.status !== "confirmed") {
    if (!isAdmin) return null;
    return (
      <div className="flex gap-1">
        <Button variant="ghost" size="sm" onClick={() => { setNewStatus(""); setStatusDialogOpen(true); }}>
          <RefreshCw className="h-3.5 w-3.5 mr-1" />Cambiar Estatus
        </Button>
        {deleteButton}
        {statusChangeDialog}
      </div>
    );
  }

  return (
    <div className="flex gap-1">
      <Button variant="ghost" size="sm" onClick={() => navigate(`/contracts/new?booking_id=${booking.id}`)}>
        <FileText className="h-3.5 w-3.5 mr-1" />Crear Contrato
      </Button>
      <Button variant="ghost" size="sm" onClick={() => { setNewEndDate(undefined); setExtendOpen(true); }}>
        <CalendarPlus className="h-3.5 w-3.5 mr-1" />Extender
      </Button>
      <Button variant="ghost" size="sm" onClick={() => navigate(`/returns?booking_id=${booking.id}`)}>
        <Undo2 className="h-3.5 w-3.5 mr-1" />Devolución Anticipada
      </Button>

      {isAdmin && (
        <>
          <Button variant="ghost" size="sm" onClick={() => { setNewStatus(""); setStatusDialogOpen(true); }}>
            <RefreshCw className="h-3.5 w-3.5 mr-1" />Cambiar Estatus
          </Button>
          {deleteButton}
        </>
      )}

      <ConfirmActionDialog
        trigger={
          <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive">
            <XCircle className="h-3.5 w-3.5 mr-1" />Cancelar
          </Button>
        }
        title="¿Cancelar esta reserva?"
        description={`Se cancelará la reserva de ${booking.customer_name || "este cliente"} (${formatDateDisplay(booking.start_date)} → ${formatDateDisplay(booking.end_date)}). Esta acción no se puede deshacer.`}
        confirmLabel="Cancelar Reserva"
        onConfirm={handleCancel}
      />

      <Dialog open={extendOpen} onOpenChange={setExtendOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Extender Reserva</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">Fecha de fin actual: {formatDateDisplay(booking.end_date)}</p>
          <DatePickerField label="Nueva Fecha de Fin" date={newEndDate} onSelect={setNewEndDate} />
          {extendPreview && (
            <div className="p-3 rounded-lg bg-muted text-sm">
              <p>Nuevo total estimado: <span className="font-bold">{formatCurrency(extendPreview.total)}</span></p>
            </div>
          )}
          <div className="flex gap-3">
            <Button onClick={() => handleExtend(() => setExtendOpen(false))} disabled={updateBookingPending}>Extender</Button>
            <Button variant="outline" onClick={() => setExtendOpen(false)}>Cancelar</Button>
          </div>
        </DialogContent>
      </Dialog>

      {statusChangeDialog}
    </div>
  );
}
