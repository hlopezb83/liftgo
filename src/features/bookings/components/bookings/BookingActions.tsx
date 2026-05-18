import { Button } from "@/components/ui/button";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { type BookingWithForklift } from "@/features/bookings/hooks/useBookings";
import { CalendarPlus, Undo2, XCircle, FileText, Trash2, RefreshCw } from "lucide-react";
import { formatDateRange } from "@/lib/utils";
import { useBookingActionsLogic } from "@/features/bookings/hooks/useBookingActionsLogic";
import { BookingStatusChangeDialog, BookingExtendDialog } from "./BookingActionDialogs";

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
    <BookingStatusChangeDialog
      open={statusDialogOpen}
      onOpenChange={setStatusDialogOpen}
      currentStatus={booking.status}
      newStatus={newStatus}
      setNewStatus={setNewStatus}
      onConfirm={handleStatusChange}
    />
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
        description={`Se cancelará la reserva de ${booking.customer_name || "este cliente"} (${formatDateRange(booking.start_date, booking.end_date)}). Esta acción no se puede deshacer.`}
        confirmLabel="Cancelar Reserva"
        onConfirm={handleCancel}
      />

      <BookingExtendDialog
        open={extendOpen}
        onOpenChange={setExtendOpen}
        currentEndDate={booking.end_date}
        newEndDate={newEndDate}
        setNewEndDate={setNewEndDate}
        extendPreview={extendPreview}
        isPending={updateBookingPending}
        onExtend={() => handleExtend(() => setExtendOpen(false))}
      />

      {statusChangeDialog}
    </div>
  );
}
