import { z } from "zod";

/** Mantiene la vuelta al documento que originó el formulario. */
export function contractFormReturnTo(id: string | undefined, bookingId: string | null): string {
  if (id && z.uuid().safeParse(id).success) return `/contracts/${id}`;
  if (bookingId && z.uuid().safeParse(bookingId).success) return `/bookings/${bookingId}`;
  return "/contracts";
}
