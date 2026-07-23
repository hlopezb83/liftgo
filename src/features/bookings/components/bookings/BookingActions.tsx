import { useState } from "react";
import { CalendarPlus, UndoIcon, ErrorIcon, DocumentIcon, DeleteIcon, RefreshIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { formatDateRange } from "@/lib/utils";
import { useBookingActionsLogic } from "../../hooks/bookingActions/useBookingActionsLogic";
import { type BookingWithForklift } from "../../hooks/bookings/useBookings";
import { BookingStatusChangeDialog, BookingExtendDialog } from "./BookingActionDialogs";

interface BookingActionsProps { booking: BookingWithForklift; }


export function BookingActions({ booking }: BookingActionsProps) {
  const {
    isAdmin, navigate,
    extendOpen, setExtendOpen,
    statusDialogOpen, setStatusDialogOpen,
    newStatus, setNewStatus,
    newEndDate, setNewEndDate,
    extendPreview,
    handleDelete, handleCancel, handleStatusChange, handleExtend,
    extendBookingPending,
  } = useBookingActionsLogic(booking);

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);

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

  const deleteDialog = (
    <ConfirmDialog
      open={deleteOpen}
      onOpenChange={setDeleteOpen}
      title="¿Eliminar esta reserva?"
      description={`Se eliminará permanentemente la reserva de ${booking.customer_name || "este cliente"}. Esta acción no se puede deshacer.`}
      confirmLabel="Eliminar"
      destructive
      onConfirm={handleDelete}
    />
  );

  const deleteButton = (
    <>
      <Button variant="destructive" size="sm" onClick={() => setDeleteOpen(true)}>
        <DeleteIcon className="h-4 w-4 mr-1" />Eliminar
      </Button>
      {deleteDialog}
    </>
  );

  if (booking.status !== "confirmed") {
    if (!isAdmin) return null;
    return (
      <div className="flex gap-2">
        <Button variant="outline" size="sm" onClick={() => { setNewStatus(""); setStatusDialogOpen(true); }}>
          <RefreshIcon className="h-4 w-4 mr-1" />Cambiar Estatus
        </Button>
        {deleteButton}
        {statusChangeDialog}
      </div>
    );
  }

  return (
    <div className="flex gap-2">
      <Button size="sm" onClick={() => navigate(`/contracts/new?booking_id=${booking.id}`)}>
        <DocumentIcon className="h-4 w-4 mr-1" />Crear Contrato
      </Button>
      <Button variant="outline" size="sm" onClick={() => { setNewEndDate(undefined); setExtendOpen(true); }}>
        <CalendarPlus className="h-4 w-4 mr-1" />Extender
      </Button>
      <Button variant="outline" size="sm" onClick={() => navigate(`/returns?booking_id=${booking.id}&early=1`)}>
        <UndoIcon className="h-4 w-4 mr-1" />Devolución Anticipada
      </Button>


      {isAdmin && (
        <>
          <Button variant="outline" size="sm" onClick={() => { setNewStatus(""); setStatusDialogOpen(true); }}>
            <RefreshIcon className="h-4 w-4 mr-1" />Cambiar Estatus
          </Button>
          {deleteButton}
        </>
      )}

      <Button variant="destructive" size="sm" onClick={() => setCancelOpen(true)}>
        <ErrorIcon className="h-4 w-4 mr-1" />Cancelar
      </Button>
      <ConfirmDialog
        open={cancelOpen}
        onOpenChange={setCancelOpen}
        title="¿Cancelar esta reserva?"
        description={`Se cancelará la reserva de ${booking.customer_name || "este cliente"} (${formatDateRange(booking.start_date, booking.end_date)}). Esta acción no se puede deshacer.`}
        confirmLabel="Cancelar Reserva"
        destructive
        onConfirm={handleCancel}
      />

      <BookingExtendDialog
        open={extendOpen}
        onOpenChange={setExtendOpen}
        currentEndDate={booking.end_date}
        newEndDate={newEndDate}
        setNewEndDate={setNewEndDate}
        extendPreview={extendPreview}
        isPending={extendBookingPending}
        onExtend={() => handleExtend(() => setExtendOpen(false))}
      />

      {statusChangeDialog}
    </div>
  );
}
