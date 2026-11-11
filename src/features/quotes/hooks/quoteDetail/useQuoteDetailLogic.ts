import { useQuoteConversionActions } from "./useQuoteConversionActions";
import { useQuoteConversionState } from "./useQuoteConversionState";
import { useQuoteDetailData } from "./useQuoteDetailData";


/** Orchestrator hook for the Quote Detail page. Composes data + state + actions. */
export function useQuoteDetailLogic(id: string | undefined) {
  const state = useQuoteConversionState();
  const data = useQuoteDetailData(id, state);
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
    linkedBookingId: data.linkedBookingId,
    alreadyInvoiced: data.alreadyInvoiced,
    draftInvoiceId: data.draftInvoiceId,
    bookingLinksStatus: data.bookingLinksStatus,
    invoiceLinksStatus: data.invoiceLinksStatus,
    retryBookingLinks: data.retryBookingLinks,
    retryInvoiceLinks: data.retryInvoiceLinks,
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

    needsCustomer: data.needsCustomer,
    catalogsError: data.catalogsError,
    catalogsPending: data.catalogsPending,
    retryCatalogs: data.retryCatalogs,
  };
}
