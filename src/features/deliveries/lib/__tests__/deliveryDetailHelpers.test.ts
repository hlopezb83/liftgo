import { describe, it, expect } from "vitest";
import type { Tables } from "@/integrations/supabase/types";
import { computeHoursUsed, buildCompletionPayload, buildDeliverySubtitle } from "../deliveryDetailHelpers";

type Delivery = Tables<"deliveries">;

const make = (over: Partial<Delivery>) => over as Delivery;

describe("computeHoursUsed", () => {
  it("calcula la diferencia entre pickup y delivery con 1 decimal", () => {
    const siblings = [
      make({ type: "delivery", hours_reading: 100 }),
      make({ type: "pickup", hours_reading: 250.456 }),
    ];
    expect(computeHoursUsed("bk1", siblings)).toBe(150.5);
  });

  it("retorna null si falta lectura en alguno", () => {
    expect(computeHoursUsed("bk1", [make({ type: "delivery", hours_reading: null })])).toBeNull();
  });

  it("retorna null sin booking_id o sin siblings", () => {
    expect(computeHoursUsed(null, [])).toBeNull();
    expect(computeHoursUsed("bk1", undefined)).toBeNull();
  });
});

describe("buildCompletionPayload", () => {
  it("incluye signature_base64 sólo si viene firma", () => {
    const p = buildCompletionPayload("d1", "2026-05-26T10:00:00Z", "data:image/png;base64,abc");
    expect(p.signature_base64).toBe("data:image/png;base64,abc");
    expect(p.status).toBe("completed");
  });

  it("omite signature y hours cuando no se envían", () => {
    const p = buildCompletionPayload("d1", "2026-05-26T10:00:00Z");
    expect(p).not.toHaveProperty("signature_base64");
    expect(p).not.toHaveProperty("hours_reading");
  });

  it("convierte hours_reading a número", () => {
    const p = buildCompletionPayload("d1", "2026-05-26T10:00:00Z", undefined, "1234.5");
    expect(p.hours_reading).toBe(1234.5);
  });

  it("R10 Bloque 4: rechaza pickup horómetro menor al de entrega", () => {
    expect(() =>
      buildCompletionPayload("d1", "2026-05-26T10:00:00Z", undefined, "1000", 1250.5)
    ).toThrow(/1250\.5/);
  });

  it("R10 Bloque 4: acepta pickup horómetro >= entrega", () => {
    const p = buildCompletionPayload("d1", "2026-05-26T10:00:00Z", undefined, "1300", 1250.5);
    expect(p.hours_reading).toBe(1300);
  });
});


describe("buildDeliverySubtitle", () => {
  it("compone 'Equipo · Entrega/Recolección'", () => {
    expect(buildDeliverySubtitle("MC-001", "delivery")).toBe("MC-001 · Entrega");
    expect(buildDeliverySubtitle("MC-002", "pickup")).toBe("MC-002 · Recolección");
  });

  it("usa 'Equipo' como fallback", () => {
    expect(buildDeliverySubtitle(null, "delivery")).toBe("Equipo · Entrega");
  });
});
