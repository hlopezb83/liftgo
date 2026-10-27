import { useCallback, useRef, useState, type ReactNode, type RefObject } from "react";
import { CalendarPlus, UndoIcon, ErrorIcon, DocumentIcon, DeleteIcon, RefreshIcon, ChevronDownIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { getAccessLevel, useRolePermissions, useUserRole, type AppRole, type PermissionsMap } from "@/features/users";
import { todayKeyMty } from "@/lib/format/dateFormats";
import { businessBlockSummary, describeBusinessBlock } from "@/lib/rules/businessBlocks";
import { cn } from "@/lib/utils";
import { returnActionAvailability, type DeliveryState } from "../../hooks/bookingActions/returnActionAvailability";
import { getValidTransitions, useBookingActionsLogic } from "../../hooks/bookingActions/useBookingActionsLogic";
import { type BookingWithForklift } from "../../hooks/bookings/useBookings";
import { BookingStatusChangeDialog, BookingExtendDialog, CancelBookingDialog } from "./BookingActionDialogs";

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

/** Altura táctil cómoda (44px) en móvil; compacta desde `sm`. */
const TOUCH = "min-h-11 sm:min-h-9";

/** Menú acotado al espacio que reporta Radix: scroll vertical en pantallas bajas o con zoom. */
const MENU_CONTENT =
  "w-64 max-w-[calc(100vw-1rem)] max-h-[var(--radix-dropdown-menu-content-available-height)] overflow-y-auto";

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
      aria-disabled={blocked || pending || undefined}
      data-blocked={blocked || undefined}
      className={cn(
        TOUCH, "items-start gap-2 whitespace-normal",
        destructive && !blocked && "text-destructive focus:text-destructive",
        blocked && "cursor-help",
      )}
      onSelect={(event) => {
        if (blocked || pending) { event.preventDefault(); return; }
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

/** El menú desmonta su ítem al abrir un diálogo; el foco vuelve al disparador
 * persistente "Más acciones" (sólo si sigue conectado y visible). */
function useMoreFocus() {
  const moreRef = useRef<HTMLButtonElement>(null);
  const focusMore = useCallback((event: Event) => {
    const target = moreRef.current;
    if (!target || !target.isConnected || target.disabled || target.getClientRects().length === 0) return;
    event.preventDefault();
    target.focus({ preventScroll: true });
  }, []);
  return { moreRef, focusMore };
}

function MoreTrigger({ triggerRef }: { triggerRef: RefObject<HTMLButtonElement | null> }) {
  return (
    <DropdownMenuTrigger asChild>
      <Button ref={triggerRef} variant="outline" size="sm" className={TOUCH}>
        Más acciones<ChevronDownIcon className="ml-1 h-4 w-4" />
      </Button>
    </DropdownMenuTrigger>
  );
}

function RiskLabel() {
  return <DropdownMenuLabel className="text-xs text-muted-foreground">Acciones de riesgo</DropdownMenuLabel>;
}

// La RPC `delete_booking` sólo acepta reservas canceladas/completadas; con
// la reserva confirmada la acción queda visible pero bloqueada y explicada,
// en vez de fallar con un reporte de error tras el clic.
function deleteBlockReason(status: string) {
  if (["cancelled", "completed"].includes(status)) return undefined;
  return businessBlockSummary(describeBusinessBlock("booking_not_final_for_delete"));
}

interface AdminRiskItemsProps {
  status: string;
  deletePending: boolean;
  onStatus: () => void;
  onDelete: () => void;
}

function AdminRiskItems({ status, deletePending, onStatus, onDelete }: AdminRiskItemsProps) {
  const isConfirmed = status === "confirmed";
  const statusBlockReason = getValidTransitions(status).length === 0
    ? "No hay cambios de estatus disponibles para esta reserva"
    : undefined;
  return (
    <>
      <MenuAction
        icon={<RefreshIcon className="h-4 w-4" />}
        label="Cambiar estatus…"
        hint={isConfirmed ? "En reserva confirmada sólo permite cancelar" : undefined}
        destructive={isConfirmed}
        blockedReason={statusBlockReason}
        onSelect={onStatus}
      />
      <MenuAction
        icon={<DeleteIcon className="h-4 w-4" />}
        label="Eliminar"
        destructive
        blockedReason={deleteBlockReason(status)}
        pending={deletePending}
        onSelect={onDelete}
      />
    </>
  );
}

interface ReturnMenuItemProps {
  booking: BookingWithForklift;
  action: ReturnType<typeof returnActionAvailability>;
  navigate: (to: string) => void;
}

function ReturnMenuItem({ booking, action, navigate }: ReturnMenuItemProps) {
  return (
    <>
      <MenuAction
        icon={<UndoIcon className="h-4 w-4" />}
        label={action.isEarly ? "Devolución Anticipada" : "Registrar devolución"}
        blockedReason={action.block ? businessBlockSummary(action.block) : undefined}
        onSelect={() => navigate(`/returns?booking_id=${booking.id}${action.isEarly ? "&early=1" : ""}`)}
      />
      <DropdownMenuSeparator />
    </>
  );
}

export function BookingActions({ booking, deliveries, transportsLoading, transportsError }: BookingActionsProps) {
  const logic = useBookingActionsLogic(booking);
  const { isAdmin, navigate, setStatusDialogOpen, setNewStatus } = logic;

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
  const { moreRef, focusMore } = useMoreFocus();
  const extendRef = useRef<HTMLButtonElement>(null);
  const focusExtend = useCallback((event: Event) => {
    const target = extendRef.current;
    if (!target || !target.isConnected || target.disabled || target.getClientRects().length === 0) return;
    event.preventDefault();
    target.focus({ preventScroll: true });
  }, []);

  const statusChangeDialog = (
    <BookingStatusChangeDialog
      open={logic.statusDialogOpen}
      onOpenChange={setStatusDialogOpen}
      currentStatus={booking.status}
      newStatus={logic.newStatus}
      setNewStatus={setNewStatus}
      onConfirm={logic.handleStatusChange}
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
      loading={logic.deleteBookingPending}
      onConfirm={logic.handleDelete}
      onCloseAutoFocus={focusMore}
    />
  );

  const adminRiskItems = (
    <AdminRiskItems
      status={booking.status}
      deletePending={logic.deleteBookingPending}
      onStatus={() => { setNewStatus(""); setStatusDialogOpen(true); }}
      onDelete={() => setDeleteOpen(true)}
    />
  );

  if (booking.status !== "confirmed") {
    if (!isAdmin) return null;
    return (
      <div className="flex flex-wrap gap-2">
        <DropdownMenu>
          <MoreTrigger triggerRef={moreRef} />
          <DropdownMenuContent align="end" className={MENU_CONTENT}>
            <RiskLabel />
            {adminRiskItems}
          </DropdownMenuContent>
        </DropdownMenu>
        {deleteDialog}
        {statusChangeDialog}
      </div>
    );
  }

  return (
    <div className="flex flex-wrap gap-2">
      {canCreateContract && (
        <Button size="sm" className={TOUCH} onClick={() => navigate(`/contracts/new?booking_id=${booking.id}`)}>
          <DocumentIcon className="h-4 w-4 mr-1" />Crear contrato
        </Button>
      )}
      {canManageBooking && <Button ref={extendRef} variant="outline" size="sm" className={TOUCH} onClick={() => { logic.setNewEndDate(undefined); logic.setExtendOpen(true); }}>
        <CalendarPlus className="h-4 w-4 mr-1" />Extender
      </Button>}

      <DropdownMenu>
        <MoreTrigger triggerRef={moreRef} />
        <DropdownMenuContent align="end" className={MENU_CONTENT}>
          {canCompleteReturn && <ReturnMenuItem booking={booking} action={returnAction} navigate={navigate} />}
          <RiskLabel />
          {isAdmin && adminRiskItems}
          <MenuAction
            icon={<ErrorIcon className="h-4 w-4" />}
            label="Cancelar reserva"
            destructive
            blockedReason={cancelBlockReason}
            pending={logic.cancelBookingPending}
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
        isPending={logic.cancelBookingPending}
        onOpenChange={(nextOpen) => { setCancelOpen(nextOpen); if (!nextOpen) setCancelReason(""); }}
        onReasonChange={setCancelReason}
        onConfirm={() => logic.handleCancel(cancelReason.trim() || undefined, () => {
          setCancelOpen(false);
          setCancelReason("");
        })}
        onCloseAutoFocus={focusMore}
      />

      {canManageBooking && <BookingExtendDialog
        open={logic.extendOpen}
        onOpenChange={logic.setExtendOpen}
        currentEndDate={booking.end_date}
        newEndDate={logic.newEndDate}
        setNewEndDate={logic.setNewEndDate}
        extendPreview={logic.extendPreview}
        isPending={logic.extendBookingPending}
        onExtend={() => logic.handleExtend(() => logic.setExtendOpen(false))}
        recurringBilling={booking.recurring_billing}
        onCloseAutoFocus={focusExtend}
      />}

      {statusChangeDialog}
    </div>
  );
}
