import { describe, expect, it } from "vitest";
import { buildExtensionLineItems } from "@/features/bookings";
import { attributedRentalSubtotal, type InvoiceBookingLink } from "../invoiceRentalAttribution";

const links: InvoiceBookingLink[] = ["a", "b"].map((id) => ({
  invoice_id: "invoice", booking_id: id,
  bookings: { forklifts: { name: `MTY-LG-${id}`, serial_number: `SER-${id}` } },
}));
const base = { description: "MTY-LG-a — Renta semanal", quantity: 1, unit_price: 4250.25, total: 4250.25 };
const other = { description: "MTY-LG-b — Renta diaria", quantity: 1, unit_price: 750.50, total: 750.50 };
const extra = { description: "Logística para extensión de renta", quantity: 1, unit_price: 400, total: 400 };

function extension(name?: string, serial?: string) {
  return buildExtensionLineItems({
    originalEndDate: "2026-10-03", newEndDate: "2026-10-05",
    forkliftRates: { daily_rate: 750.50, weekly_rate: 4250.25, monthly_rate: 14500.75 },
    forkliftName: name, serialNumber: serial,
  });
}

describe("renta facturada de extensiones", () => {
  it("reconoce una extensión generada de dos días: 2 × 750.50 = 1,501.00", () => {
    expect(attributedRentalSubtotal(extension("MTY-LG-a"), 1501, "a", [links[0]])).toBe(1501);
  });

  it("suma la extensión junto con la renta original y excluye logística", () => {
    expect(attributedRentalSubtotal([base, ...extension("MTY-LG-a"), extra], 6151.25, "a", [links[0]])).toBe(5751.25);
  });

  it("conserva el descuento neto de la extensión sin cambiar tarifas", () => {
    const discounted = extension("MTY-LG-a").map((line) => ({ ...line, discount: 10, discount_type: "%" }));
    expect(attributedRentalSubtotal([base, ...discounted, extra], 6001.15, "a", [links[0]])).toBe(5601.15);
  });

  it("atribuye una extensión por nombre único entre varias reservas", () => {
    const rows = [other, ...extension("MTY-LG-a"), extra];
    expect(attributedRentalSubtotal(rows, 2651.50, "a", links)).toBe(1501);
    expect(attributedRentalSubtotal(rows, 2651.50, "b", links)).toBe(750.50);
  });

  it("usa la serie de la extensión cuando cambió el nombre del equipo", () => {
    expect(attributedRentalSubtotal([...extension("Nombre anterior", "SER-a"), other], 2251.50, "a", links)).toBe(1501);
  });

  it("una extensión sin nombre se puede atribuir a su única reserva vinculada", () => {
    expect(attributedRentalSubtotal(extension(), 1501, "a", [links[0]])).toBe(1501);
  });

  it("un nombre ambiguo de extensión exige revisión en vez de un reparto igual", () => {
    const ambiguous = links.map((link) => ({ ...link, bookings: links[0].bookings }));
    expect(attributedRentalSubtotal(extension("MTY-LG-a"), 1501, "a", ambiguous)).toBeNull();
  });

  it.each(["b", 42])("no atribuye una partida cuyo vínculo explícito %s contradice la única reserva", (booking_id) => {
    expect(attributedRentalSubtotal([{ ...base, booking_id }], 4250.25, "a", [links[0]])).toBeNull();
  });

  it("conserva una partida con vínculo explícito coherente", () => {
    expect(attributedRentalSubtotal([{ ...base, booking_id: "a" }], 4250.25, "a", [links[0]])).toBe(4250.25);
  });
});
