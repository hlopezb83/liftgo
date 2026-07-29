import { describe, it, expect } from "vitest";
import { QUOTE_STATUS_LABELS, quoteStatusLabel } from "../constants";

describe("QUOTE_STATUS_LABELS (V3-5 / DB3-08)", () => {
  it("usa el dominio real de la base de datos", () => {
    expect(QUOTE_STATUS_LABELS.rejected).toBe("Rechazada");
    expect(QUOTE_STATUS_LABELS.cancelled).toBe("Cancelada");
    expect(QUOTE_STATUS_LABELS.sent).toBe("Enviada");
  });

  it("ya no ofrece el estado obsoleto 'declined'", () => {
    expect(QUOTE_STATUS_LABELS.declined).toBeUndefined();
  });

  it("regresa el estado crudo cuando no hay etiqueta", () => {
    expect(quoteStatusLabel("desconocido")).toBe("desconocido");
  });
});
