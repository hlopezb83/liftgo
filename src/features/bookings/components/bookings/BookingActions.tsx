import { useState } from "react";
import { CalendarPlus, UndoIcon, ErrorIcon, DocumentIcon, DeleteIcon, RefreshIcon } from "@/components/icons";
import { BlockedActionButton } from "@/components/feedback/BlockedActionButton";
import { Button } from "@/components/ui/button";
import { describeBusinessBlock } from "@/lib/rules/businessBlocks";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { getAccessLevel, useRolePermissions, useUserRole } from "@/features/users";
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
    deleteBookingPending, cancelBookingPending, extendBookingPending,
  } = useBookingActionsLogic(booking);

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState("");

  // R6-FE-04b (N6-VEN-03): ventas (Reservas=read, Contratos=none) veía
  // "Crear contrato" y "Cancelar"; el cancel moría en la DB con error críptico.
  const { data: role } = useUserRole();
  const { data: perms } = useRolePermissions();
  const canCreateContract = !!perms && getAccessLevel(perms, role ?? undefined, "Contratos") === "full";
  const canCancelBooking = !!perms && getAccessLevel(perms, role ?? undefined, "Reservas") === "full";
  const cancelBlockReason = canCancelBooking
    ? undefined
    : "Tu rol solo puede consultar reservas; pide a un administrador cancelarla";

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
      loading={deleteBookingPending}
      onConfirm={handleDelete}
    />
  );

  // La RPC `delete_booking` sólo acepta reservas canceladas/completadas; con
  // la reserva confirmada el botón queda visible pero bloqueado y explicado,
  // en vez de fallar con un reporte de error tras el clic.
  const deleteBlock = !["cancelled", "completed"].includes(booking.status)
    ? describeBusinessBlock("booking_not_final_for_delete")
    : null;

  const deleteButton = (
    <>
      <BlockedActionButton
        variant="destructive"
        size="sm"
        block={deleteBlock}
        disabled={deleteBookingPending}
        onClick={() => setDeleteOpen(true)}
      >
        <DeleteIcon className="h-4 w-4 mr-1" />Eliminar
      </BlockedActionButton>
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
    <div className="flex flex-wrap gap-2">
      {canCreateContract && (
        <Button size="sm" onClick={() => navigate(`/contracts/new?booking_id=${booking.id}`)}>
          <DocumentIcon className="h-4 w-4 mr-1" />Crear contrato
        </Button>
      )}
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

      <span title={cancelBlockReason}>
        <Button variant="destructive" size="sm" disabled={!canCancelBooking || cancelBookingPending} onClick={() => setCancelOpen(true)}>
          <ErrorIcon className="h-4 w-4 mr-1" />Cancelar
        </Button>
      </span>
      {cancelBlockReason && (
        <p className="basis-full text-xs text-muted-foreground">{cancelBlockReason}</p>
      )}
      <Dialog
        open={cancelOpen}
        onOpenChange={(o) => { setCancelOpen(o); if (!o) setCancelReason(""); }}
      >
        <DialogContent className="max-w-md">
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
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              placeholder="Ej. cliente reprogramó, cambio de equipo, error de captura…"
              rows={3}
              maxLength={500}
            />
            <p className="text-xs text-muted-foreground">Se registrará en la bitácora del equipo.</p>
          </div>
          <DialogFooter>
            <Button variant="outline" disabled={cancelBookingPending} onClick={() => setCancelOpen(false)}>Volver</Button>
            <Button
              variant="destructive"
              disabled={cancelBookingPending}
              onClick={() => handleCancel(cancelReason.trim() || undefined)}
            >
              Cancelar Reserva
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
