import { describe, expect, it } from "vitest";
import {
  bookingsForForkliftInRange,
  clampBookingToRange,
  hasOverlappingBookings,
  invoiceMonthKey,
  invoiceTotalMxn,
  invoicesForMonth,
  type DrilldownBooking,
  type DrilldownInvoice,
} from "../drilldown";

const RANGE_START = new Date(2026, 0, 10);
const RANGE_END = new Date(2026, 0, 20);

function booking(over: Partial<DrilldownBooking> = {}): DrilldownBooking {
  return {
    id: "b1",
    booking_number: "RSV-0001",
    customer_name: "ACME",
    forklift_id: "f1",
    start_date: "2026-01-12",
    end_date: "2026-01-15",
    status: "confirmed",
    ...over,
  };
}

describe("clampBookingToRange", () => {
  it("recorta la reserva al rango y cuenta días inclusivos", () => {
    const r = clampBookingToRange(booking({ start_date: "2026-01-01", end_date: "2026-01-31" }), RANGE_START, RANGE_END);
    expect(r).not.toBeNull();
    expect(r?.clampedStart).toBe("2026-01-10");
    expect(r?.clampedEnd).toBe("2026-01-20");
    expect(r?.daysInRange).toBe(11);
  });

  it("devuelve null cuando no traslapa", () => {
    expect(clampBookingToRange(booking({ start_date: "2026-02-01", end_date: "2026-02-05" }), RANGE_START, RANGE_END)).toBeNull();
  });
});

describe("bookingsForForkliftInRange", () => {
  const list = [
    booking({ id: "a", start_date: "2026-01-12", end_date: "2026-01-14" }),
    booking({ id: "b", start_date: "2026-01-13", end_date: "2026-01-16" }),
    booking({ id: "c", status: "cancelled" }),
    booking({ id: "d", forklift_id: "f2" }),
    booking({ id: "e", start_date: "2026-03-01", end_date: "2026-03-02" }),
  ];

  it("filtra por unidad, excluye canceladas y las fuera de rango", () => {
    const r = bookingsForForkliftInRange(list, "f1", RANGE_START, RANGE_END);
    expect(r.map((b) => b.id)).toEqual(["a", "b"]);
  });

  it("detecta traslape entre reservas", () => {
    const r = bookingsForForkliftInRange(list, "f1", RANGE_START, RANGE_END);
    expect(hasOverlappingBookings(r)).toBe(true);
  });

  it("no reporta traslape cuando las reservas son consecutivas sin compartir día", () => {
    const r = bookingsForForkliftInRange(
      [
        booking({ id: "a", start_date: "2026-01-11", end_date: "2026-01-12" }),
        booking({ id: "b", start_date: "2026-01-13", end_date: "2026-01-14" }),
      ],
      "f1", RANGE_START, RANGE_END,
    );
    expect(hasOverlappingBookings(r)).toBe(false);
  });
});

function invoice(over: Partial<DrilldownInvoice> = {}): DrilldownInvoice {
  return {
    id: "i1",
    invoice_number: "FAC-0001",
    customer_name: "ACME",
    issued_at: "2026-01-15",
    total: 1000,
    status: "sent",
    moneda: "MXN",
    tipo_cambio: 1,
    ...over,
  };
}

describe("invoicesForMonth", () => {
  it("agrupa por mes de emisión excluyendo borradores y canceladas", () => {
    const list = [
      invoice({ id: "a", total: 100 }),
      invoice({ id: "b", total: 500 }),
      invoice({ id: "c", status: "draft" }),
      invoice({ id: "d", status: "cancelled" }),
      invoice({ id: "e", issued_at: "2026-02-01" }),
    ];
    expect(invoicesForMonth(list, "2026-01").map((i) => i.id)).toEqual(["b", "a"]);
  });

  it("calcula la clave de mes", () => {
    expect(invoiceMonthKey(invoice({ issued_at: "2026-07-31" }))).toBe("2026-07");
  });

  it("normaliza USD a MXN con tipo de cambio", () => {
    expect(invoiceTotalMxn(invoice({ total: 100, moneda: "USD", tipo_cambio: 18 }))).toBe(1800);
  });
});
