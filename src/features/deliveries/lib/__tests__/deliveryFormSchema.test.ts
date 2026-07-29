import { describe, it, expect } from "vitest";
import { deliverySchema } from "../deliveryFormSchema";

const base = {
  forkliftId: "fk-1",
  bookingId: "bk-1",
  type: "delivery",
  scheduledDate: new Date(),
  scheduledTime: "10:00",
  address: "Calle 1",
  driverName: "Juan",
  driverPhone: "5555555555",
  notes: "",
};

describe("deliverySchema", () => {
  it("acepta payload válido", () => {
    const r = deliverySchema.safeParse(base);
    expect(r.success).toBe(true);
  });

  it("rechaza bookingId vacío", () => {
    const r = deliverySchema.safeParse({ ...base, bookingId: "" });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues.some((i) => i.message === "La entrega debe estar ligada a una reserva")).toBe(true);
    }
  });

  it("rechaza scheduledDate en el pasado", () => {
    const pastDate = new Date();
    pastDate.setDate(pastDate.getDate() - 1);
    const r = deliverySchema.safeParse({ ...base, scheduledDate: pastDate });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues.some((i) => i.message === "La entrega no puede programarse en el pasado")).toBe(true);
    }
  });

  it("acepta scheduledDate hoy", () => {
    const r = deliverySchema.safeParse({ ...base, scheduledDate: new Date() });
    expect(r.success).toBe(true);
  });
});
