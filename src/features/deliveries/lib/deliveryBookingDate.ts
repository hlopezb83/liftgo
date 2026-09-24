/**
 * Mirrors validate_delivery_booking_integrity in the database so date mistakes
 * appear beside the form field before the insert/update reaches the server.
 * YYYY-MM-DD strings can be compared lexicographically.
 */
export function deliveryBookingDateError(
  type: string,
  scheduledDate: string,
  booking: { start_date: string; end_date: string },
): string | null {
  if (
    type === "delivery" &&
    (scheduledDate < booking.start_date || scheduledDate > booking.end_date)
  ) {
    return "La entrega debe caer dentro del periodo de la reserva";
  }
  if (type === "pickup" && scheduledDate < booking.start_date) {
    return "La recolección no puede ser anterior al inicio de la reserva";
  }
  return null;
}

/**
 * Suggests a valid date only when a newly selected booking makes the current
 * date invalid. A valid date chosen by the operator is never replaced.
 */
export function suggestedScheduledTransportDate(
  type: string,
  selectedDate: string | undefined,
  booking: { start_date: string; end_date: string },
  today: string,
  alreadyCompleted: boolean,
): string | null {
  if (type !== "delivery" && type !== "pickup") return null;
  if (selectedDate && !deliveryBookingDateError(type, selectedDate, booking)) return null;

  const bookingDate = type === "pickup" ? booking.end_date : booking.start_date;
  const candidate = alreadyCompleted || bookingDate >= today ? bookingDate : today;
  return deliveryBookingDateError(type, candidate, booking) ? null : candidate;
}

/** Reconsider only the date this form suggested; preserve manual edits. */
export function suggestedDateAfterTransportTypeChange(
  type: string,
  selectedDate: string | undefined,
  lastSuggestedDate: string | null,
  booking: { start_date: string; end_date: string },
  today: string,
  alreadyCompleted: boolean,
): string | null {
  if (!lastSuggestedDate || selectedDate !== lastSuggestedDate) return null;
  const nextDate = suggestedScheduledTransportDate(
    type, undefined, booking, today, alreadyCompleted,
  );
  return nextDate === selectedDate ? null : nextDate;
}
