import { useBookingDraft } from "./useBookingDraft";
import { useBookingFormState } from "./useBookingFormState";
import { useBookingFormSubmit } from "./useBookingFormSubmit";

/**
 * Encapsula todo el estado y los handlers de BookingForm:
 * formulario, sincronización de forklift disponible, y los diálogos
 * post-creación (entrega y política de mantenimiento).
 */
export function useBookingFormLogic() {
  const stateBag = useBookingFormState();
  const draft = useBookingDraft(stateBag.form);
  const submitBag = useBookingFormSubmit({
    canSubmit: draft.canSubmit,
    captureCompletion: draft.captureCompletion,
    revalidateAvailability: stateBag.revalidateAvailability,
  });

  const selectedForklift = stateBag.forklifts?.find(
    (f) => f.id === (submitBag.postBooking?.forkliftId ?? stateBag.forkliftId),
  );

  return {
    form: stateBag.form,
    draft,
    isSubmitting: submitBag.isSubmitting,
    submitError: submitBag.submitError,
    customers: submitBag.customers,
    createBooking: submitBag.createBooking,
    dateRange: stateBag.dateRange,
    forkliftId: stateBag.forkliftId,
    availableForklifts: stateBag.availableForklifts,
    availabilityLoading: stateBag.availabilityLoading,
    availabilityError: stateBag.availabilityError,
    availabilityFetching: stateBag.availabilityFetching,
    revalidateAvailability: stateBag.revalidateAvailability,
    datesSelected: stateBag.datesSelected,
    onSubmit: submitBag.onSubmit,
    postBooking: submitBag.postBooking,
    showPolicyDialog: submitBag.showPolicyDialog,
    handleDeliveryDone: submitBag.handleDeliveryDone,
    handlePolicyDone: submitBag.handlePolicyDone,
    selectedForklift,
    dateRangeError: stateBag.dateRangeError,
    navigate: submitBag.navigate,
  };
}
