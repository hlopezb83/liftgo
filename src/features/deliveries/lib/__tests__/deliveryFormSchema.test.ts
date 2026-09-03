import { describe, it, expect, vi, afterEach } from "vitest";
import { deliverySchema } from "../deliveryFormSchema";
import { nowMty } from "@/lib/utils";

const base = {
  forkliftId: "fk-1",
  bookingId: "bk-1",
  type: "delivery",
  alreadyCompleted: false,
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

  it("rechaza scheduledDate en el pasado si no es histórica", () => {
    // Base en hora Monterrey: usar new Date() daba falsos negativos entre 00:00 y 06:00 UTC.
    const pastDate = nowMty();
    pastDate.setDate(pastDate.getDate() - 1);
    const r = deliverySchema.safeParse({ ...base, scheduledDate: pastDate });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(
        r.error.issues.some((i) => i.message.includes("marca")),
      ).toBe(true);
    }
  });

  it("acepta scheduledDate en el pasado cuando alreadyCompleted es true (histórico)", () => {
    // Base en hora Monterrey: usar new Date() daba falsos negativos entre 00:00 y 06:00 UTC.
    const pastDate = nowMty();
    pastDate.setDate(pastDate.getDate() - 1);
    const r = deliverySchema.safeParse({ ...base, alreadyCompleted: true, scheduledDate: pastDate });
    expect(r.success).toBe(true);
  });

  it("acepta scheduledDate hoy", () => {
    const r = deliverySchema.safeParse({ ...base, scheduledDate: new Date() });
    expect(r.success).toBe(true);
  });
});

describe("deliverySchema — TZ Monterrey (Auditoría R9)", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("no rechaza como pasado un scheduledDate de \"hoy en Monterrey\" cuando UTC ya cruzó a mañana", () => {
    // 2026-01-01T02:00:00Z == 2025-12-31 20:00 en Monterrey (UTC-6): sigue
    // siendo "hoy" 31-dic para el negocio, aunque en UTC ya sea 1-ene.
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T02:00:00Z"));
    const scheduledDate = new Date(2025, 11, 31);
    const r = deliverySchema.safeParse({ ...base, scheduledDate });
    expect(r.success).toBe(true);
  });
});

describe("deliverySchema — Bug 3: justificación sin operador ni firma", () => {
  it("rechaza histórico completado sin operador y sin justificación", () => {
    const r = deliverySchema.safeParse({
      ...base, alreadyCompleted: true, scheduledDate: nowMty(), driverName: "",
    });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues.some((i) =>
        i.path.join(".") === "noEvidenceReason" && i.message.includes("quién autorizó"),
      )).toBe(true);
    }
  });

  it("acepta histórico sin operador CON justificación", () => {
    const r = deliverySchema.safeParse({
      ...base, alreadyCompleted: true, scheduledDate: nowMty(), driverName: "",
      noEvidenceReason: "Autorizó el supervisor por teléfono",
    });
    expect(r.success).toBe(true);
  });

  it("con operador asignado no exige justificación (hay evidencia)", () => {
    const r = deliverySchema.safeParse({
      ...base, alreadyCompleted: true, scheduledDate: nowMty(), driverName: "Juan",
    });
    expect(r.success).toBe(true);
  });

  it("programada (no histórica) nunca exige justificación", () => {
    const r = deliverySchema.safeParse({ ...base, driverName: "", scheduledDate: nowMty() });
    expect(r.success).toBe(true);
  });
});
