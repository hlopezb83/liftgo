import { applyDiscountToBase, lineItemTotal, money } from "@/lib/domain/invoiceTotals";

export interface InvoiceBookingLink {
  invoice_id: string;
  booking_id: string;
  bookings?: { forklifts: { name: string | null; serial_number: string | null } | null } | null;
}

type InvoiceLine = {
  description?: unknown; quantity?: unknown; unit_price?: unknown; total?: unknown;
  discount?: unknown; discount_type?: unknown; booking_id?: unknown;
};

function nonnegative(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function lineBase(line: InvoiceLine): number | null {
  if (nonnegative(line.quantity) && line.quantity > 0 && nonnegative(line.unit_price)) {
    const base = lineItemTotal(line.quantity, line.unit_price);
    return line.total == null || line.total === base ? base : null;
  }
  if (line.quantity == null && line.unit_price == null && nonnegative(line.total)) return line.total;
  return null;
}

function validDiscount(line: InvoiceLine): boolean {
  if (line.discount != null && !nonnegative(line.discount)) return false;
  if (line.discount_type === "$") return true;
  if (line.discount_type != null && line.discount_type !== "%") return false;
  return line.discount == null || Number(line.discount) <= 100;
}

function lineNet(value: unknown): number | null {
  if (!value || typeof value !== "object") return null;
  const line = value as InvoiceLine;
  const base = lineBase(line);
  if (base === null || !validDiscount(line)) return null;
  return applyDiscountToBase(base, line.discount as number | undefined, line.discount_type as "$" | "%" | undefined);
}

function linkedBooking(line: InvoiceLine, links: InvoiceBookingLink[]): string | null {
  if (typeof line.booking_id === "string") return links.some((link) => link.booking_id === line.booking_id) ? line.booking_id : null;
  const description = typeof line.description === "string" ? line.description : "";
  const bySerial = links.filter((link) => {
    const serial = link.bookings?.forklifts?.serial_number;
    return !!serial && description.includes(`(Serie: ${serial})`);
  });
  if (bySerial.length > 0) return bySerial.length === 1 ? bySerial[0].booking_id : null;
  const byName = links.filter((link) => {
    const name = link.bookings?.forklifts?.name;
    return !!name && description.startsWith(`${name} — Renta `);
  });
  return byName.length === 1 ? byName[0].booking_id : null;
}

/** line_index is selection order, not a reliable line assignment. Never divide an ambiguous invoice equally. */
export function attributedRentalSubtotal(
  lineItems: unknown, storedSubtotal: number, bookingId: string, links: InvoiceBookingLink[],
): number | null {
  if (!Array.isArray(lineItems) || lineItems.length === 0 || !Number.isFinite(storedSubtotal) || storedSubtotal < 0) return null;
  const net = lineItems.map(lineNet);
  if (net.some((value) => value === null)) return null;
  const sum = net.reduce<number>((total, value) => total + money(value ?? 0).intValue, 0);
  if (sum !== money(storedSubtotal).intValue) return null;
  const distinct = new Set(links.map((link) => link.booking_id));
  if (!distinct.has(bookingId)) return null;
  const rental = lineItems.flatMap((value, index) => {
    const line = value as InvoiceLine;
    if (typeof line.description !== "string"
      || !(line.description.includes(" — Renta ") || line.description.startsWith("Renta "))) return [];
    return [{ bookingId: distinct.size <= 1 ? bookingId : linkedBooking(line, links), net: net[index] ?? 0 }];
  });
  if (rental.length === 0 || rental.some((line) => line.bookingId === null)
    || (distinct.size > 1 && [...distinct].some((id) => !rental.some((line) => line.bookingId === id)))) return null;
  return rental.filter((line) => line.bookingId === bookingId).reduce((total, line) => money(total).add(line.net).value, 0);
}
