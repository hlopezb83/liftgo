import { describe, it, expect } from "vitest";
import type { Json } from "@/integrations/supabase/types";
import { buildDeliveryInfos, resolveLegacyForkliftIds } from "../quoteBookingBuilders";

const emptyLineItems: Json = [];

const forklifts = [
  { id: "f1", name: "MC-001" },
  { id: "f2", name: "MC-002" },
  { id: "f3", name: "MC-003" },
];
const customers = [{ id: "c1", address: "Av. Industrial 123" }];

describe("buildDeliveryInfos", () => {
  it("empareja booking_id ↔ forklift_id y arrastra dirección del cliente", () => {
    const result = buildDeliveryInfos(
      ["f1", "f2"].map((forklift_id, index) => ({
        booking_id: `BK-${index + 1}`, forklift_id, customer_id: "c1", start_date: "2026-03-01", end_date: "2026-03-31",
      })),
      customers, forklifts,
    );
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({
      bookingId: "BK-1", forkliftId: "f1", forkliftName: "MC-001",
      startDate: "2026-03-01", endDate: "2026-03-31", customerAddress: "Av. Industrial 123",
    });
    expect(result[1].forkliftName).toBe("MC-002");
  });

  it("usa fallbacks cuando faltan datos", () => {
    const result = buildDeliveryInfos(
      [{ booking_id: "BK-1", forklift_id: "fx", customer_id: "x", start_date: "2026-03-01", end_date: "2026-03-31" }],
      undefined, undefined,
    );
    expect(result[0]).toEqual({
      bookingId: "BK-1", forkliftId: "fx", forkliftName: "Montacargas",
      startDate: "2026-03-01", endDate: "2026-03-31", customerAddress: null,
    });
  });
});

describe("resolveLegacyForkliftIds", () => {
  it("deduce ids a partir de descripciones en line_items", () => {
    const quote = {
      line_items: [
        { description: "MC-001 — Renta mensual", quantity: 1, unit_price: 0, total: 0 },
        { description: "MC-002 — Renta semanal", quantity: 1, unit_price: 0, total: 0 },
      ],
    };
    const ids = resolveLegacyForkliftIds(quote, forklifts);
    expect(ids).toEqual(["f1", "f2"]);
  });

  it("no duplica ids cuando la descripción coincide varias veces", () => {
    const quote = {
      line_items: [
        { description: "MC-001 — Renta mensual", quantity: 1, unit_price: 0, total: 0 },
        { description: "MC-001 — Renta diaria", quantity: 1, unit_price: 0, total: 0 },
      ],
    };
    expect(resolveLegacyForkliftIds(quote, forklifts)).toEqual(["f1"]);
  });

  it("cae al forklift_id legacy cuando no hay match en descripciones", () => {
    const quote = { forklift_id: "f3", line_items: emptyLineItems };
    expect(resolveLegacyForkliftIds(quote, forklifts)).toEqual(["f3"]);
  });

  it("devuelve [] si no hay forklift_id ni matches", () => {
    expect(resolveLegacyForkliftIds({ line_items: emptyLineItems }, forklifts)).toEqual([]);
  });
});
