export type SelectableBooking = { id: string; customer_name: string | null; start_date: string; end_date: string; forklift_id: string; status: string };

/**
 * R-C6 + F9: reservas seleccionables para una entrega. Sólo las `confirmed`
 * (canceladas/completadas son terminales) y, si ya hay montacargas elegido,
 * sólo las de ese equipo — el RPC rechaza cualquier otra combinación.
 */
export function selectableBookings(
  bookings: SelectableBooking[] | undefined,
  forkliftId: string | undefined,
): SelectableBooking[] | undefined {
  const active = bookings?.filter((b) => b.status === "confirmed");
  return forkliftId ? active?.filter((b) => b.forklift_id === forkliftId) : active;
}

