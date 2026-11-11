import { FormDialog } from "@/components/forms/FormDialog";
import { Button } from "@/components/ui/button";
import { PostBookingDeliveryDialog } from "@/features/bookings";
import { useHasModuleAccess } from "@/features/users";
import { isPublicoGeneral } from "../../hooks/quoteDetail/useQuoteDetailData";
import { ConvertQuoteDialog } from "./ConvertQuoteDialog";
import { EquipmentAssignmentDialog } from "./EquipmentAssignmentDialog";
import type { useQuoteDetailLogic } from "../../hooks/quoteDetail/useQuoteDetailLogic";

type Logic = ReturnType<typeof useQuoteDetailLogic>;

interface Props {
  logic: Logic;
}

function QuoteAssignmentStep({ logic }: Props) {
  const { quote, catalogsError, catalogsPending, retryCatalogs, setShowAssignmentDialog, equipmentModels, forklifts } = logic;
  if (catalogsError || catalogsPending) {
    return (
      <FormDialog open onOpenChange={setShowAssignmentDialog} title="Asignar equipos" description="Preparando los datos de asignación.">
        {catalogsError ? (
          <div role="alert">No se pudieron cargar los datos de asignación. <Button type="button" variant="link" onClick={retryCatalogs}>Reintentar</Button></div>
        ) : <p role="status">Cargando equipos…</p>}
      </FormDialog>
    );
  }
  if (!equipmentModels || !forklifts) return null;
  return (
    <EquipmentAssignmentDialog
      open
      onOpenChange={setShowAssignmentDialog}
      startDate={quote?.start_date ?? null}
      endDate={quote?.end_date ?? null}
      rentalMeta={logic.rentalMeta}
      models={equipmentModels}
      forklifts={forklifts}
      onConfirm={logic.handleAssignmentConfirm}
      isLoading={logic.isConverting}
    />
  );
}

export function QuoteConversionDialogs({ logic }: Props) {
  const canScheduleDelivery = useHasModuleAccess("Entregas", "full");
  const {
    quote, durationDays, unitCount, customers,
    isConverting, isModelBasedQuote,
    showConvertDialog, setShowConvertDialog,
    showAssignmentDialog,
    pendingDeliveries, currentDeliveryIndex,
    handleConvertConfirm, handleDeliveryNext,
    needsCustomer, catalogsPending, catalogsError, retryCatalogs,
  } = logic;

  return (
    <>
      {pendingDeliveries.length > 0 && pendingDeliveries[currentDeliveryIndex] && (
        <PostBookingDeliveryDialog
          key={pendingDeliveries[currentDeliveryIndex].bookingId}
          allowScheduling={canScheduleDelivery}
          open
          onOpenChange={(open) => { if (!open) handleDeliveryNext(); }}
          bookingId={pendingDeliveries[currentDeliveryIndex].bookingId}
          forkliftId={pendingDeliveries[currentDeliveryIndex].forkliftId}
          forkliftName={pendingDeliveries[currentDeliveryIndex].forkliftName}
          startDate={pendingDeliveries[currentDeliveryIndex].startDate}
          endDate={pendingDeliveries[currentDeliveryIndex].endDate}
          customerAddress={pendingDeliveries[currentDeliveryIndex].customerAddress}
          onSkip={handleDeliveryNext}
          currentIndex={currentDeliveryIndex}
          totalCount={pendingDeliveries.length}
        />
      )}

      {quote && showConvertDialog && (
        <ConvertQuoteDialog
          open={showConvertDialog}
          onOpenChange={setShowConvertDialog}
          quote={quote}
          durationDays={durationDays}
          unitCount={unitCount}
          needsCustomer={needsCustomer}
          customers={(customers ?? []).filter((c) => !isPublicoGeneral(c.name))}
          needsAssignment={isModelBasedQuote}
          isPending={isConverting}
          loadingCatalogs={catalogsPending}
          retryCatalogs={catalogsError ? retryCatalogs : undefined}
          onConfirm={(payload) => { void handleConvertConfirm(payload); }}
        />
      )}

      {showAssignmentDialog && <QuoteAssignmentStep logic={logic} />}
    </>
  );
}
