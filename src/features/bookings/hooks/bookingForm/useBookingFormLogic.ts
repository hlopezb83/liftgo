import { useBookingFormState } from "./useBookingFormState";
import { useBookingFormSubmit } from "./useBookingFormSubmit";

/**
 * Encapsula todo el estado y los handlers de BookingForm:
 * formulario, sincronización de forklift disponible, y los diálogos
 * post-creación (entrega y política de mantenimiento).
 */
export function useBookingFormLogic() {
  const stateBag = useBookingFormState();
  const submitBag = useBookingFormSubmit();

  const selectedForklift = stateBag.forklifts?.find(
    (f) => f.id === submitBag.postBooking?.forkliftId,
  );

  return {
    form: stateBag.form,
    customers: submitBag.customers,
    createBooking: submitBag.createBooking,
    dateRange: stateBag.dateRange,
    forkliftId: stateBag.forkliftId,
    availableForklifts: stateBag.availableForklifts,
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
