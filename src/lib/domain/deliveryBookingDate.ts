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
