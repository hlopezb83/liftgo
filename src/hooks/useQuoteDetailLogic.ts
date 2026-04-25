import { useQuoteDetailData, isPublicoGeneral } from "./quoteDetail/useQuoteDetailData";
import { useQuoteConversionState } from "./quoteDetail/useQuoteConversionState";
import { useQuoteConversionActions } from "./quoteDetail/useQuoteConversionActions";

export type { DeliveryInfo } from "./quoteDetail/useQuoteConversionState";

/** Orchestrator hook for the Quote Detail page. Composes data + state + actions. */
export function useQuoteDetailLogic(id: string | undefined) {
  const data = useQuoteDetailData(id);
  const state = useQuoteConversionState();
  const actions = useQuoteConversionActions(id, data, state);

  return {
    // Data
    quote: data.quote,
    isLoading: data.isLoading,
    lineItems: data.lineItems,
    customerMatch: data.customerMatch,
    quoteType: data.quoteType,
    isSale: data.isSale,
    alreadyConverted: data.alreadyConverted,
    durationDays: data.durationDays,
    rentalMeta: data.rentalMeta,
    customers: data.customers,
    forklifts: data.forklifts,
    equipmentModels: data.equipmentModels,

    // Conversion state
    isConverting: state.isConverting,
    showRecurringDialog: state.showRecurringDialog,
    setShowRecurringDialog: state.setShowRecurringDialog,
    showCustomerReassignDialog: state.showCustomerReassignDialog,
    setShowCustomerReassignDialog: state.setShowCustomerReassignDialog,
    reassignCustomerId: state.reassignCustomerId,
    setReassignCustomerId: state.setReassignCustomerId,
    reassignCustomerName: state.reassignCustomerName,
    setReassignCustomerName: state.setReassignCustomerName,
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
