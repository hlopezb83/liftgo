interface QueryFetchSource {
  isFetching?: boolean;
  refetch: () => unknown;
}

export interface InvoiceAvailabilitySources {
  candidatesBlock: string | null;
  periods: {
    availabilityBlock: string | null;
    block: string | null;
    invalidHistory?: boolean;
    isFetching?: boolean;
    refetch: () => unknown;
  };
  prefillBlock: string | null | undefined;
  isLoadingPrefill?: boolean;
  retryPrefill: () => unknown;
  quotePrefill: { block: string | null; retry: () => unknown };
  equipment: { isError?: boolean; isFetching?: boolean; refetch: () => unknown };
  bookingSourceBlock: string | null;
  chargeSelectionError: string | null;
  isLoadingCharges: boolean;
  retryChargeSelection: () => unknown;
  chargeAvailability: QueryFetchSource;
  bookingsQuery: QueryFetchSource;
  invoiceBookingsQuery: QueryFetchSource;
  quoteQuery: { isFetching?: boolean };
  assignmentsQuery: { isFetching?: boolean };
  sourceCustomer: { isLoading?: boolean };
}

export function buildInvoiceAvailabilityControls(src: InvoiceAvailabilitySources) {
  const bookingAvailabilityBlock =
    [src.candidatesBlock, src.periods.availabilityBlock].find(Boolean) ?? null;

  const isLoadingChargeAvailability = [
    src.bookingsQuery.isFetching,
    src.isLoadingCharges,
    src.chargeAvailability.isFetching,
    src.periods.isFetching,
    src.isLoadingPrefill,
    src.equipment.isFetching,
    src.quoteQuery.isFetching,
    src.assignmentsQuery.isFetching,
    src.sourceCustomer.isLoading,
  ].some(Boolean);

  const retryChargeAvailability = () => {
    if (src.prefillBlock) return src.retryPrefill();
    if (src.quotePrefill.block) return src.quotePrefill.retry();
    if (src.equipment.isError) return src.equipment.refetch();
    if ([src.candidatesBlock, src.periods.block, src.periods.invalidHistory].some(Boolean)) {
      return Promise.all([src.bookingsQuery.refetch(), src.periods.refetch()]);
    }
    if (src.bookingSourceBlock) {
      return Promise.all([src.bookingsQuery.refetch(), src.invoiceBookingsQuery.refetch()]);
    }
    return src.chargeSelectionError ? src.retryChargeSelection() : src.chargeAvailability.refetch();
  };

  return {
    bookingAvailabilityBlock,
    retryChargeAvailability,
    isLoadingChargeAvailability,
  };
}
