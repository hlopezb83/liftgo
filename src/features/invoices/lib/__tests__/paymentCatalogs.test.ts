import { describe, it, expect } from "vitest";
import { CREDIT_NOTE_MOTIVES, CREDIT_NOTE_MOTIVE_LABELS } from "../creditNoteMotives";
import { PAYMENT_INTENT_STATUS } from "../paymentIntentStatus";
import { PAYMENT_METHODS, satCodeForMethod } from "../paymentMethods";

describe("satCodeForMethod", () => {
  it("mapea cada método interno a su clave del catálogo SAT", () => {
    expect(satCodeForMethod("transfer")).toBe("03");
    expect(satCodeForMethod("cash")).toBe("01");
    expect(satCodeForMethod("check")).toBe("02");
    expect(satCodeForMethod("card")).toBe("04");
  });

  it("usa transferencia (03) como fallback para métodos desconocidos", () => {
    expect(satCodeForMethod("bitcoin")).toBe("03");
  });

  it("todos los métodos tienen etiqueta y clave SAT de 2 dígitos", () => {
    for (const m of PAYMENT_METHODS) {
      expect(m.label.length).toBeGreaterThan(0);
      expect(m.sat).toMatch(/^\d{2}$/);
    }
  });
});

describe("catálogos de UI", () => {
  it("cada estatus de intención de pago tiene etiqueta y variante", () => {
    expect(PAYMENT_INTENT_STATUS.pending_review.label).toBe("En revisión");
    expect(PAYMENT_INTENT_STATUS.approved.variant).toBe("default");
    expect(PAYMENT_INTENT_STATUS.rejected.variant).toBe("destructive");
  });

  it("los motivos de nota de crédito exponen etiqueta corta por valor", () => {
    expect(CREDIT_NOTE_MOTIVES).toHaveLength(4);
    for (const m of CREDIT_NOTE_MOTIVES) {
      expect(CREDIT_NOTE_MOTIVE_LABELS[m.value]).toBe(m.shortLabel);
    }
  });
});
