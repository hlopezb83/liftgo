import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { toYMD } from "@/lib/date/toYMD";
import { createPickupSchema, defaultPickupDate } from "../postDeliveryPickupForm";

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-09-24T18:00:00Z"));
});
afterEach(() => vi.useRealTimers());

describe("programación de recolección", () => {
  it("rechaza una fecha pasada con un mensaje en el campo de fecha", () => {
    const result = createPickupSchema(null).safeParse({ scheduledDate: new Date(2026, 8, 23) });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]).toMatchObject({
        path: ["scheduledDate"],
        message: "La recolección debe programarse para hoy o una fecha futura",
      });
    }
  });

  it.each([24, 25])("acepta el día %i de septiembre", (day) => {
    expect(createPickupSchema(null).safeParse({ scheduledDate: new Date(2026, 8, day) }).success).toBe(true);
  });

  it("valida con el día actual aunque el esquema se haya creado ayer", () => {
    const schema = createPickupSchema(null);
    vi.setSystemTime(new Date("2026-09-25T18:00:00Z"));
    expect(schema.safeParse({ scheduledDate: new Date(2026, 8, 24) }).success).toBe(false);
  });

  it("usa el día de Monterrey cuando UTC ya pasó a mañana", () => {
    vi.setSystemTime(new Date("2026-01-01T02:00:00Z"));
    expect(createPickupSchema(null).safeParse({ scheduledDate: new Date(2025, 11, 31) }).success).toBe(true);
    expect(toYMD(defaultPickupDate("2025-12-20"))).toBe("2025-12-31");
  });

  it("propone hoy para rentas vencidas y conserva un fin futuro", () => {
    expect(toYMD(defaultPickupDate("2026-09-20"))).toBe("2026-09-24");
    expect(toYMD(defaultPickupDate("2026-11-13"))).toBe("2026-11-13");
  });
});
