import { describe, expect, it } from "vitest";
import { verifyContractRevenue, type ContractQuoteTerms } from "../contractRevenueVerification";

const booking = { quote_id: "quote", organization_id: "org" };
const quote: ContractQuoteTerms = { id: "quote", organization_id: "org", line_items: [], rental_meta: [] };
const verify = (source: ContractQuoteTerms | null | undefined) => verifyContractRevenue({
  booking, quote: source, isLoading: false, isError: false,
});

describe("verificación del ingreso esperado contractual", () => {
  it("no presenta tarifas brutas como importe pactado cuando la cotización aplica descuento", () => {
    expect(verify({ ...quote, line_items: [{ total: 10001.50, discount: 10, discount_type: "%" }] }))
      .toMatchObject({ status: "review", reason: expect.stringMatching(/cotización tiene descuento/) });
    expect(verify({ ...quote, rental_meta: [{ discount: 100, discountType: "$" }] }).status).toBe("review");
  });

  it.each([null, undefined])("una cotización ausente (%s) sigue requiriendo revisión", (source) => {
    expect(verify(source).status).toBe("review");
  });

  it("una reserva cargada legítimamente sin cotización conserva su estimación por tarifas", () => {
    expect(verifyContractRevenue({ booking: { quote_id: null }, quote: null, isLoading: false, isError: false }))
      .toEqual({ status: "verified", reason: null });
  });

  it("la reserva ausente no se confunde con una reserva sin cotización", () => {
    expect(verifyContractRevenue({ booking: undefined, quote: null, isLoading: false, isError: false }).status).toBe("review");
    expect(verifyContractRevenue({ booking: undefined, quote: null, isLoading: true, isError: false }).status).toBe("loading");
  });

  it("ni datos previos durante la carga ni un error con datos cacheados habilitan importes", () => {
    expect(verifyContractRevenue({ booking, quote, isLoading: true, isError: false }).status).toBe("loading");
    expect(verifyContractRevenue({ booking, quote, isLoading: false, isError: true }).status).toBe("review");
  });

  it("rechaza fuentes de otra organización o de otra cotización", () => {
    expect(verify({ ...quote, organization_id: "other-org" }).status).toBe("review");
    expect(verify({ ...quote, id: "other-quote" }).status).toBe("review");
    expect(verifyContractRevenue({ booking: { quote_id: "quote" }, quote, isLoading: false, isError: false }).status).toBe("review");
  });

  it("la fuente incompleta no prueba la ausencia de descuentos", () => {
    expect(verify({ ...quote, line_items: null }).status).toBe("review");
  });

  it("con una cotización verificada sin descuento conserva las tarifas originales", () => {
    expect(verify({ ...quote, line_items: [{ total: 1000, discount: 0 }], rental_meta: null }))
      .toEqual({ status: "verified", reason: null });
  });
});
