import { describe, it, expect } from "vitest";
import { bookingFormSchema } from "../bookingFormSchema";

const baseValid = {
  forklift_id: "fk-1",
  date_range: { from: new Date("2026-05-01"), to: new Date("2026-05-15") },
  customer_id: "",
  customer_name: "",
  customer_contact: "",
  recurring_billing: false,
};

describe("bookingFormSchema", () => {
  it("acepta payload válido", () => {
    const r = bookingFormSchema.safeParse(baseValid);
    expect(r.success).toBe(true);
  });

  it("rechaza forklift_id vacío", () => {
    const r = bookingFormSchema.safeParse({ ...baseValid, forklift_id: "" });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues.some((i) => i.message === "Montacargas es requerido")).toBe(true);
    }
  });

  it("rechaza date_range sin fecha de inicio", () => {
    const r = bookingFormSchema.safeParse({
      ...baseValid,
      date_range: { from: undefined, to: new Date("2026-05-15") },
    });
    expect(r.success).toBe(false);
  });

  it("rechaza date_range sin fecha de fin", () => {
    const r = bookingFormSchema.safeParse({
      ...baseValid,
      date_range: { from: new Date("2026-05-01"), to: undefined },
    });
    expect(r.success).toBe(false);
  });

  it("rechaza cuando fecha de fin es anterior al inicio", () => {
    const r = bookingFormSchema.safeParse({
      ...baseValid,
      date_range: { from: new Date("2026-05-15"), to: new Date("2026-05-01") },
    });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues.some((i) =>
        i.message.includes("posterior"),
      )).toBe(true);
    }
  });

  it("acepta from === to (reserva de un día)", () => {
    const same = new Date("2026-05-01");
    const r = bookingFormSchema.safeParse({
      ...baseValid,
      date_range: { from: same, to: same },
    });
    expect(r.success).toBe(true);
  });

  it("recurring_billing default es false", () => {
    const r = bookingFormSchema.parse({ ...baseValid });
    expect(r.recurring_billing).toBe(false);
  });
});
