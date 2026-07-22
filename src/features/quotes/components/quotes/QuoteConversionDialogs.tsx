import { FormDialog, FormDialogFooter } from "@/components/forms/FormDialog";
import { Button } from "@/components/ui/button";
import { PostBookingDeliveryDialog } from "@/features/bookings";
import { CustomerSelector } from "@/features/customers";
import { EquipmentAssignmentDialog } from "./EquipmentAssignmentDialog";
import type { useQuoteDetailLogic } from "../../hooks/quoteDetail/useQuoteDetailLogic";

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

      <FormDialog
        open={showRecurringDialog}
        onOpenChange={setShowRecurringDialog}
        title="Facturación Recurrente"
        description={
          `Esta cotización cubre un periodo de ${Math.round(durationDays / 30)} mes(es) (${durationDays} días). ` +
          "¿Desea habilitar la facturación recurrente mensual para las reservas que se crearán?"
        }
      >
        <FormDialogFooter>
          <Button variant="outline" onClick={() => handleRecurringChoice(false)}>No, crear sin recurrente</Button>
          <Button onClick={() => handleRecurringChoice(true)}>Sí, habilitar recurrente</Button>
        </FormDialogFooter>
      </FormDialog>

      <FormDialog
        open={showCustomerReassignDialog}
        onOpenChange={setShowCustomerReassignDialog}
        title="Asignar Cliente"
        description='Esta cotización está asignada a "Público en General". Selecciona el cliente final antes de convertir a reserva.'
      >
        <div className="space-y-4">
          <CustomerSelector
            customers={customers?.filter((c) => !isPublicoGeneral(c.name))}
            customerId={reassignCustomerId}
            customerName={reassignCustomerName}
            onCustomerIdChange={setReassignCustomerId}
            onCustomerNameChange={setReassignCustomerName}
            required
            hideManualName
          />
          <FormDialogFooter>
            <Button variant="outline" onClick={() => setShowCustomerReassignDialog(false)}>Cancelar</Button>
            <Button onClick={handleReassignConfirm} disabled={!reassignCustomerId}>Confirmar y Convertir</Button>
          </FormDialogFooter>
        </div>
      </FormDialog>

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
