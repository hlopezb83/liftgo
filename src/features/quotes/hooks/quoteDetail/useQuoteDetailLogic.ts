import { useQuoteConversionActions } from "./useQuoteConversionActions";
import { useQuoteConversionState } from "./useQuoteConversionState";
import { useQuoteDetailData, isPublicoGeneral } from "./useQuoteDetailData";

export type { DeliveryInfo } from "./useQuoteConversionState";

/** Orchestrator hook for the Quote Detail page. Composes data + state + actions. */
export function useQuoteDetailLogic(id: string | undefined) {
  const data = useQuoteDetailData(id);
  const state = useQuoteConversionState();
  const actions = useQuoteConversionActions(id, data, state);

  return {
    // Data
    quote: data.quote,
    isLoading: data.isLoading,
    isError: data.isError,
    refetchQuote: data.refetchQuote,
    lineItems: data.lineItems,
    customerMatch: data.customerMatch,
    quoteType: data.quoteType,
    isSale: data.isSale,
    alreadyConverted: data.alreadyConverted,
    alreadyInvoiced: data.alreadyInvoiced,
    durationDays: data.durationDays,
    rentalMeta: data.rentalMeta,
    isModelBasedQuote: data.isModelBasedQuote,
    unitCount: data.unitCount,
    customers: data.customers,
    forklifts: data.forklifts,
    equipmentModels: data.equipmentModels,

    // Conversion state
    isConverting: state.isConverting,
    showConvertDialog: state.showConvertDialog,
    setShowConvertDialog: state.setShowConvertDialog,
    showAssignmentDialog: state.showAssignmentDialog,
    setShowAssignmentDialog: state.setShowAssignmentDialog,

    // Delivery state
    pendingDeliveries: state.pendingDeliveries,
    currentDeliveryIndex: state.currentDeliveryIndex,

    // Actions
    ...actions,

    // Helpers
    isPublicoGeneral,
  };
}
