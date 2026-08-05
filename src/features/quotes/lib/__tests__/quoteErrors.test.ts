import { describe, it, expect } from "vitest";
import { quoteCreateErrorMessage } from "../quoteErrors";

function withCode(message: string, code?: string): Error {
  const error = new Error(message);
  if (code) Object.assign(error, { code });
  return error;
}

describe("quoteCreateErrorMessage", () => {
  it("usa el mensaje de folio sólo ante conflicto 23505 de quote_number", () => {
    const msg = quoteCreateErrorMessage(
      withCode('duplicate key value violates unique constraint "quotes_quote_number_key"', "23505"),
    );
    expect(msg).toContain("secuencia de folios desincronizada");
  });

  it("expone el mensaje real ante validaciones de la base de datos", () => {
    const msg = quoteCreateErrorMessage(
      withCode("Las partidas no cuadran con el subtotal: suma de partidas (100) <> subtotal (90)", "23514"),
    );
    expect(msg).toContain("no cuadran con el subtotal");
  });

  it("no confunde otros conflictos de unicidad con folios", () => {
    const msg = quoteCreateErrorMessage(withCode("duplicate key on quotes_pkey", "23505"));
    expect(msg).toContain("quotes_pkey");
  });
});
