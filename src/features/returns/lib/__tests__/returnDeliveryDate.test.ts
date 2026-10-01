import { describe, expect, it } from "vitest";
import { earliestReturnDate } from "../returnDeliveryDate";

describe("earliestReturnDate", () => {
  it("usa custodia física histórica, en Monterrey, anterior al periodo pactado", () => {
    expect(earliestReturnDate({ start_date: "2026-10-12", deliveries: [
      { type: "delivery", status: "completed", completed_at: "2026-10-01T02:00:00Z" },
    ] })).toBe("2026-09-30");
  });
  it("una entrega tardía impide inspecciones anteriores a la entrega física", () => {
    expect(earliestReturnDate({ start_date: "2026-09-01", deliveries: [
      { type: "delivery", status: "completed", completed_at: "2026-09-03T18:00:00Z" },
      { type: "pickup", status: "completed", completed_at: "2026-09-02T18:00:00Z" },
    ] })).toBe("2026-09-03");
  });
  it("los históricos sin prueba temporal conservan el mínimo comercial", () => {
    expect(earliestReturnDate({ start_date: "2026-09-01" })).toBe("2026-09-01");
  });
});
