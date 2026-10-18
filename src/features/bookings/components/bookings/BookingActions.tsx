import { useCallback, useRef, useState, type ReactNode } from "react";
import { CalendarPlus, UndoIcon, ErrorIcon, DocumentIcon, DeleteIcon, RefreshIcon, ChevronDownIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { getAccessLevel, useRolePermissions, useUserRole, type AppRole, type PermissionsMap } from "@/features/users";
import { todayKeyMty } from "@/lib/format/dateFormats";
import { businessBlockSummary, describeBusinessBlock } from "@/lib/rules/businessBlocks";
import { cn, formatDateRange } from "@/lib/utils";
import { returnActionAvailability, type DeliveryState } from "../../hooks/bookingActions/returnActionAvailability";
import { useBookingActionsLogic } from "../../hooks/bookingActions/useBookingActionsLogic";
import { type BookingWithForklift } from "../../hooks/bookings/useBookings";
import { BookingStatusChangeDialog, BookingExtendDialog } from "./BookingActionDialogs";

interface BookingActionsProps {
  booking: BookingWithForklift;
  deliveries: DeliveryState[] | undefined;
  transportsLoading: boolean;
  transportsError: boolean;
}

function resolveActionAccess(perms: PermissionsMap | undefined, role: AppRole | undefined) {
  const hasFullAccess = (module: string) => getAccessLevel(perms, role, module) === "full";
  return {
    canCreateContract: hasFullAccess("Contratos"),
    canManageBooking: hasFullAccess("Reservas"),
    canCompleteReturn: hasFullAccess("Entregas"),
  };
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

function CancelBookingDialog({
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

/** Altura táctil cómoda (44px) en móvil; compacta desde `sm`. */
const TOUCH = "min-h-11 sm:min-h-9";

interface MenuActionProps {
  icon: ReactNode;
  label: string;
  /** Motivo visible cuando la acción está bloqueada: el ítem sigue enfocable. */
  blockedReason?: string;
  /** Deshabilitado temporal (mutación en curso). */
  pending?: boolean;
  destructive?: boolean;
  hint?: string;
  onSelect: () => void;
}

/**
 * Ítem de menú que no usa `disabled` de Radix cuando hay bloqueo de negocio:
 * así sigue alcanzable con teclado/tap y el motivo queda legible en el ítem.
 */
function MenuAction({ icon, label, blockedReason, pending, destructive, hint, onSelect }: MenuActionProps) {
  const blocked = Boolean(blockedReason);
  return (
    <DropdownMenuItem
      disabled={pending}
      aria-disabled={blocked || undefined}
      data-blocked={blocked || undefined}
      className={cn(
        TOUCH, "items-start gap-2 whitespace-normal",
        destructive && !blocked && "text-destructive focus:text-destructive",
        blocked && "cursor-help",
      )}
      onSelect={(event) => {
        if (blocked) { event.preventDefault(); return; }
        onSelect();
      }}
    >
      <span className={cn("mt-0.5 shrink-0", blocked && "opacity-50")}>{icon}</span>
      <span className="flex min-w-0 flex-col">
        <span className={cn(blocked && "opacity-60")}>{label}</span>
        {hint && !blocked && <span className="text-xs text-muted-foreground">{hint}</span>}
        {blocked && <span className="text-xs text-muted-foreground">{blockedReason}</span>}
      </span>
    </DropdownMenuItem>
  );
}

export function BookingActions({ booking, deliveries, transportsLoading, transportsError }: BookingActionsProps) {
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
  const { canCreateContract, canManageBooking, canCompleteReturn } = resolveActionAccess(perms, role ?? undefined);
  const returnAction = returnActionAvailability(
    booking,
    { deliveries, isLoading: transportsLoading, isError: transportsError },
    todayKeyMty(),
  );
  const cancelBlockReason = canManageBooking
    ? undefined
    : "Tu rol solo puede consultar reservas; pide a un administrador cancelarla";

  // El menú desmonta su ítem al abrir un diálogo; el foco vuelve al disparador
  // persistente "Más acciones" (sólo si sigue conectado y visible).
  const moreRef = useRef<HTMLButtonElement>(null);
  const focusMore = useCallback((event: Event) => {
    const target = moreRef.current;
    if (!target || !target.isConnected || target.disabled || target.getClientRects().length === 0) return;
    event.preventDefault();
    target.focus({ preventScroll: true });
  }, []);

  const statusChangeDialog = (
    <BookingStatusChangeDialog
      open={statusDialogOpen}
      onOpenChange={setStatusDialogOpen}
      currentStatus={booking.status}
      newStatus={newStatus}
      setNewStatus={setNewStatus}
      onConfirm={handleStatusChange}
      onCloseAutoFocus={focusMore}
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
      onCloseAutoFocus={focusMore}
    />
  );

  // La RPC `delete_booking` sólo acepta reservas canceladas/completadas; con
  // la reserva confirmada la acción queda visible pero bloqueada y explicada,
  // en vez de fallar con un reporte de error tras el clic.
  const deleteBlock = !["cancelled", "completed"].includes(booking.status)
    ? describeBusinessBlock("booking_not_final_for_delete")
    : null;

  const openStatusDialog = () => { setNewStatus(""); setStatusDialogOpen(true); };
  const isConfirmed = booking.status === "confirmed";

  const adminRiskItems = (
    <>
      <MenuAction
        icon={<RefreshIcon className="h-4 w-4" />}
        label="Cambiar estatus…"
        hint={isConfirmed ? "En reserva confirmada sólo permite cancelar" : undefined}
        destructive={isConfirmed}
        onSelect={openStatusDialog}
      />
      <MenuAction
        icon={<DeleteIcon className="h-4 w-4" />}
        label="Eliminar"
        destructive
        blockedReason={deleteBlock ? businessBlockSummary(deleteBlock) : undefined}
        pending={deleteBookingPending}
        onSelect={() => setDeleteOpen(true)}
      />
    </>
  );

  const moreTrigger = (
    <DropdownMenuTrigger asChild>
      <Button ref={moreRef} variant="outline" size="sm" className={TOUCH}>
        Más acciones<ChevronDownIcon className="ml-1 h-4 w-4" />
      </Button>
    </DropdownMenuTrigger>
  );

  if (!isConfirmed) {
    if (!isAdmin) return null;
    return (
      <div className="flex flex-wrap gap-2">
        <DropdownMenu>
          {moreTrigger}
          <DropdownMenuContent align="end" className="w-64">
            <DropdownMenuLabel className="text-xs text-muted-foreground">Acciones de riesgo</DropdownMenuLabel>
            {adminRiskItems}
          </DropdownMenuContent>
        </DropdownMenu>
        {deleteDialog}
        {statusChangeDialog}
      </div>
    );
  }

  const returnLabel = returnAction.isEarly ? "Devolución Anticipada" : "Registrar devolución";

  return (
    <div className="flex flex-wrap gap-2">
      {canCreateContract && (
        <Button size="sm" className={TOUCH} onClick={() => navigate(`/contracts/new?booking_id=${booking.id}`)}>
          <DocumentIcon className="h-4 w-4 mr-1" />Crear contrato
        </Button>
      )}
      {canManageBooking && <Button variant="outline" size="sm" className={TOUCH} onClick={() => { setNewEndDate(undefined); setExtendOpen(true); }}>
        <CalendarPlus className="h-4 w-4 mr-1" />Extender
      </Button>}

      <DropdownMenu>
        {moreTrigger}
        <DropdownMenuContent align="end" className="w-64">
          {canCompleteReturn && (
            <>
              <MenuAction
                icon={<UndoIcon className="h-4 w-4" />}
                label={returnLabel}
                blockedReason={returnAction.block ? businessBlockSummary(returnAction.block) : undefined}
                onSelect={() => navigate(`/returns?booking_id=${booking.id}${returnAction.isEarly ? "&early=1" : ""}`)}
              />
              <DropdownMenuSeparator />
            </>
          )}
          <DropdownMenuLabel className="text-xs text-muted-foreground">Acciones de riesgo</DropdownMenuLabel>
          {isAdmin && adminRiskItems}
          <MenuAction
            icon={<ErrorIcon className="h-4 w-4" />}
            label="Cancelar reserva"
            destructive
            blockedReason={cancelBlockReason}
            pending={cancelBookingPending}
            onSelect={() => setCancelOpen(true)}
          />
        </DropdownMenuContent>
      </DropdownMenu>

      {cancelBlockReason && (
        <p className="basis-full text-xs text-muted-foreground">{cancelBlockReason}</p>
      )}
      {isAdmin && deleteDialog}
      <CancelBookingDialog
        booking={booking}
        open={cancelOpen}
        reason={cancelReason}
        isPending={cancelBookingPending}
        onOpenChange={(nextOpen) => { setCancelOpen(nextOpen); if (!nextOpen) setCancelReason(""); }}
        onReasonChange={setCancelReason}
        onConfirm={() => handleCancel(cancelReason.trim() || undefined, () => {
          setCancelOpen(false);
          setCancelReason("");
        })}
        onCloseAutoFocus={focusMore}
      />

      {canManageBooking && <BookingExtendDialog
        open={extendOpen}
        onOpenChange={setExtendOpen}
        currentEndDate={booking.end_date}
        newEndDate={newEndDate}
        setNewEndDate={setNewEndDate}
        extendPreview={extendPreview}
        isPending={extendBookingPending}
        onExtend={() => handleExtend(() => setExtendOpen(false))}
      />}

      {statusChangeDialog}
    </div>
  );
}
