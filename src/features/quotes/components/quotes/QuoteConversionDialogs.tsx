import { PostBookingDeliveryDialog } from "@/features/bookings";
import { ConvertQuoteDialog } from "./ConvertQuoteDialog";
import { EquipmentAssignmentDialog } from "./EquipmentAssignmentDialog";
import type { useQuoteDetailLogic } from "../../hooks/quoteDetail/useQuoteDetailLogic";

type Logic = ReturnType<typeof useQuoteDetailLogic>;

interface Props {
  logic: Logic;
}

export function QuoteConversionDialogs({ logic }: Props) {
  const {
    quote, durationDays, unitCount, customers, forklifts, equipmentModels, rentalMeta,
    isConverting, isModelBasedQuote,
    showConvertDialog, setShowConvertDialog,
    showAssignmentDialog, setShowAssignmentDialog,
    pendingDeliveries, currentDeliveryIndex,
    handleConvertConfirm, handleAssignmentConfirm, handleDeliveryNext,
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

      {quote && showConvertDialog && (
        <ConvertQuoteDialog
          open={showConvertDialog}
          onOpenChange={setShowConvertDialog}
          quote={quote}
          durationDays={durationDays}
          unitCount={unitCount}
          needsCustomer={isPublicoGeneral(quote.customer_name)}
          customers={(customers ?? []).filter((c) => !isPublicoGeneral(c.name))}
          needsAssignment={isModelBasedQuote}
          isPending={isConverting}
          onConfirm={(payload) => { void handleConvertConfirm(payload); }}
        />
      )}

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
