import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { CustomerSelector } from "@/components/customers/CustomerSelector";
import { EquipmentAssignmentDialog } from "@/features/quotes/components/quotes/EquipmentAssignmentDialog";
import { PostBookingDeliveryDialog } from "@/components/bookings/PostBookingDeliveryDialog";
import type { useQuoteDetailLogic } from "@/features/quotes/hooks/useQuoteDetailLogic";

type Logic = ReturnType<typeof useQuoteDetailLogic>;

interface Props {
  logic: Logic;
}

export function QuoteConversionDialogs({ logic }: Props) {
  const {
    durationDays, customers, forklifts, equipmentModels, rentalMeta,
    isConverting,
    showRecurringDialog, setShowRecurringDialog,
    showCustomerReassignDialog, setShowCustomerReassignDialog,
    reassignCustomerId, setReassignCustomerId, reassignCustomerName, setReassignCustomerName,
    showAssignmentDialog, setShowAssignmentDialog,
    pendingDeliveries, currentDeliveryIndex,
    handleReassignConfirm, handleRecurringChoice, handleAssignmentConfirm, handleDeliveryNext,
    isPublicoGeneral,
  } = logic;

  return (
    <>
      {pendingDeliveries.length > 0 && pendingDeliveries[currentDeliveryIndex] && (
        <PostBookingDeliveryDialog
          open
          onOpenChange={(open) => { if (!open) handleDeliveryNext(); }}
          bookingId={pendingDeliveries[currentDeliveryIndex].bookingId}
          forkliftId={pendingDeliveries[currentDeliveryIndex].forkliftId}
          forkliftName={pendingDeliveries[currentDeliveryIndex].forkliftName}
          startDate={pendingDeliveries[currentDeliveryIndex].startDate}
          customerAddress={pendingDeliveries[currentDeliveryIndex].customerAddress}
          onSkip={handleDeliveryNext}
          currentIndex={currentDeliveryIndex}
          totalCount={pendingDeliveries.length}
        />
      )}

      <Dialog open={showRecurringDialog} onOpenChange={setShowRecurringDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Facturación Recurrente</DialogTitle>
            <DialogDescription>
              Esta cotización cubre un periodo de {Math.round(durationDays / 30)} mes(es) ({durationDays} días).
              ¿Desea habilitar la facturación recurrente mensual para las reservas que se crearán?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => handleRecurringChoice(false)}>No, crear sin recurrente</Button>
            <Button onClick={() => handleRecurringChoice(true)}>Sí, habilitar recurrente</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showCustomerReassignDialog} onOpenChange={setShowCustomerReassignDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Asignar Cliente</DialogTitle>
            <DialogDescription>
              Esta cotización está asignada a "Público en General". Selecciona el cliente final antes de convertir a reserva.
            </DialogDescription>
          </DialogHeader>
          <CustomerSelector
            customers={customers?.filter(c => !isPublicoGeneral(c.name))}
            customerId={reassignCustomerId}
            customerName={reassignCustomerName}
            onCustomerIdChange={setReassignCustomerId}
            onCustomerNameChange={setReassignCustomerName}
            required
            hideManualName
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCustomerReassignDialog(false)}>Cancelar</Button>
            <Button onClick={handleReassignConfirm} disabled={!reassignCustomerId}>Confirmar y Convertir</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {showAssignmentDialog && equipmentModels && forklifts && (
        <EquipmentAssignmentDialog
          open={showAssignmentDialog}
          onOpenChange={setShowAssignmentDialog}
          rentalMeta={rentalMeta}
          models={equipmentModels}
          forklifts={forklifts}
          onConfirm={handleAssignmentConfirm}
          isLoading={isConverting}
        />
      )}
    </>
  );
}
