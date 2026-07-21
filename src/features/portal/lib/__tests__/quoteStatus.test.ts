import { describe, it, expect } from "vitest";
import { quoteStatusLabel, QUOTE_STATUS_LABELS } from "../quoteStatus";

describe("quoteStatusLabel", () => {
  it("traduce estados conocidos", () => {
    expect(quoteStatusLabel("sent")).toBe("Enviada");
    expect(quoteStatusLabel("accepted")).toBe("Aceptada");
    expect(quoteStatusLabel("rejected")).toBe("Rechazada");
    expect(quoteStatusLabel("expired")).toBe("Vencida");
  });

  it("cae a '—' ante estado desconocido o vacío", () => {
    expect(quoteStatusLabel("pending_review")).toBe("—");
    expect(quoteStatusLabel(null)).toBe("—");
    expect(quoteStatusLabel(undefined)).toBe("—");
    expect(quoteStatusLabel("")).toBe("—");
  });

  it("cubre draft, cancelled y alias declined", () => {
    expect(QUOTE_STATUS_LABELS.draft).toBe("Borrador");
    expect(QUOTE_STATUS_LABELS.cancelled).toBe("Cancelada");
    expect(QUOTE_STATUS_LABELS.declined).toBe("Rechazada");
  });
});
