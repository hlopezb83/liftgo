import { describe, it, expect } from "vitest";
import { QUOTE_STATUS_LABELS, quoteStatusLabel } from "../constants";

describe("QUOTE_STATUS_LABELS (V3-5 / DB3-08)", () => {
  it("usa el dominio real de la base de datos", () => {
    expect(QUOTE_STATUS_LABELS.rejected).toBe("Rechazada");
    expect(QUOTE_STATUS_LABELS.cancelled).toBe("Cancelada");
    expect(QUOTE_STATUS_LABELS.sent).toBe("Enviada");
  });

  it("no depende del estado obsoleto 'declined' para rechazar", () => {
    // 'declined' sobrevive en STATUS_LABELS global (histórico), pero el estado
    // canónico de cotizaciones es 'rejected'.
    expect(quoteStatusLabel("rejected")).toBe("Rechazada");
    expect(quoteStatusLabel("declined")).not.toBe("Rechazada");
  });


  it("regresa el estado crudo cuando no hay etiqueta", () => {
    expect(quoteStatusLabel("desconocido")).toBe("desconocido");
  });
});
