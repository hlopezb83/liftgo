// Barrel público de la feature "bookings".
// Re-exporta la API consumida por otras features.
// Generado automáticamente; ampliar manualmente si hace falta.
export { PostBookingDeliveryDialog } from "./components/PostBookingDeliveryDialog";
export { RecurringBillingBadge } from "./components/RecurringBillingBadge";
export { getValidTransitions } from "./hooks/bookingActions/useBookingActionsLogic";
export { useBookingExtension } from "./hooks/bookingActions/useBookingExtensions";
export { useCreateBooking } from "./hooks/useBookingMutations";
export {
  type Booking,
  BOOKINGS_RANGE_LIMIT,
  type BookingWithForklift,
  useBooking,
  useBookings,
  useBookingsRange,
  useConfirmedBookingsForDelivery,
} from "./hooks/useBookings";
export {
  computeHourometer,
} from "./hooks/bookingDetail/useBookingHourometer";
// v7.218.0 · ARQ2-A5: exponer queryKeys y helper de días al público.
export { bookingKeys } from "./lib/queryKeys";
export { rentalDaysInclusive } from "./lib/rentalDays";
export { allowsRecurringBilling } from "./lib/recurringBillingEligibility";
// v7.307.0: facturación de extensiones (consumido por la feature invoices).
export { buildExtensionLineItems, extensionBillableRange } from "./lib/extensionBilling";
