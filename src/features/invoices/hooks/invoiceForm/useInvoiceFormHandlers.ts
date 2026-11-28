import type { QuotedRentalBooking } from "@/features/quotes";
import { prefillBillingPeriod } from "../../lib/bookingCompatibility";
import {
  applyInitialBillingPeriod,
  applyPrimaryCurrency,
  applyPrimaryCustomer,
  buildLinesForBooking,
  type InvoiceHandlerBooking,
} from "./bookingRentalLines";
import { preserveInvoiceReceiverEdits } from "./preserveInvoiceReceiverEdits";
import { loadBookingSelectionBundle } from "./resolveBookingSelectionData";
import { useDetachedCustomerSelection } from "./useDetachedCustomerSelection";
import type { Customer } from "./invoiceFormBuilders";
import type { InvoiceRentalEquipment } from "./useInvoiceRentalEquipment";
import type { InvoiceFormValues } from "../../lib/invoiceFormSchema";
import type { QuoteChargeAvailability } from "../../lib/quoteChargeAvailability";
import type { BookingQuoteSource } from "../../lib/quotedBookingLines";
import type { UseFormReturn } from "react-hook-form";

// Regla canónica del periodo pre-llenado: vive en `lib/bookingCompatibility`
// porque también la usan el selector multi-reserva y la validación al guardar.
export { prefillBillingPeriod, buildLinesForBooking, applyPrimaryCurrency };

interface Props {
  form: UseFormReturn<InvoiceFormValues>;
  customers: Customer[] | undefined;
  bookings: InvoiceHandlerBooking[] | undefined;
  forklifts?: InvoiceRentalEquipment[];
  loadEquipment?: (ids: readonly string[]) => Promise<InvoiceRentalEquipment[]>;
  loadCustomer?: (id: string) => Promise<Customer>;
  /** Cotizaciones origen de las reservas cargadas; se usan para arrastrar
   *  partidas no-renta (logística/entrega) a la factura. */
  quotes?: BookingQuoteSource[] | undefined;
  loadQuoteSources?: (quoteIds: string[]) => Promise<BookingQuoteSource[]>;
  loadQuotedBookings?: (quoteIds: string[]) => Promise<QuotedRentalBooking[]>;
  loadQuoteCharges: (quoteIds: string[]) => Promise<QuoteChargeAvailability>;
}

export function useInvoiceFormHandlers({
  form,
  customers,
  bookings,
  forklifts,
  quotes,
  loadEquipment,
  loadCustomer,
  loadQuoteSources,
  loadQuotedBookings,
  loadQuoteCharges,
}: Props) {
  const state = useDetachedCustomerSelection(form, customers, bookings);

  const handleBookingsChange = async (selectedIds: string[]) => {
    const request = state.beginSelectionRequest(selectedIds);
    if (request === null) return;
    const defaults = preserveInvoiceReceiverEdits(form);
    let bundle: Awaited<ReturnType<typeof loadBookingSelectionBundle>>;
    try {
      bundle = await loadBookingSelectionBundle(
        {
          selectedIds,
          bookings,
          customers,
          forklifts,
          quotes,
          loadEquipment,
          loadCustomer,
          loadQuoteSources,
          loadQuotedBookings,
          loadQuoteCharges,
          getCurrentLineItems: () => form.getValues("lineItems"),
        },
        () => state.isCurrentRequest(request),
      );
      if (!bundle) return;
    } catch (error) {
      state.failSelectionRequest(request, error);
      return;
    } finally {
      defaults.dispose();
      state.finishSelectionRequest(request);
    }

    form.setValue("bookingIds", selectedIds, { shouldDirty: true });
    form.setValue("bookingId", selectedIds[0] ?? "", { shouldDirty: true });
    applyInitialBillingPeriod(form, bundle.selected[0]);

    if (bundle.selected.length === 0) return;

    applyPrimaryCustomer(defaults.form, bundle.selected[0], bundle.primaryCustomer);
    applyPrimaryCurrency(defaults.form, bundle.selected[0]);
    form.setValue("lineItems", [...bundle.rentalLines, ...bundle.extraLines], { shouldDirty: true });
    state.completeSelectionSuccess();
  };

  // Compat: handler antiguo single-select (delega al multi).
  const handleBookingSelect = (id: string) => {
    void handleBookingsChange(id ? [id] : []);
  };

  return {
    handleCustomerSelect: state.handleCustomerSelect,
    handleBookingSelect,
    handleBookingsChange,
    isLoadingCharges: state.isLoadingCharges,
    chargeSelectionError: state.chargeSelectionError,
    retryChargeSelection: () => {
      const retryIds = state.getRetrySelectionIds();
      return retryIds.length ? handleBookingsChange(retryIds) : Promise.resolve();
    },
  };
}
