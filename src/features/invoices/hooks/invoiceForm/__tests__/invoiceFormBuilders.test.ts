import { describe, it, expect } from "vitest";
import { cfdiFromCustomer, buildFromQuote, type Customer, type SourceQuote } from "../invoiceFormBuilders";

function makeCustomer(over: Partial<Customer> = {}): Customer {
  return {
    id: "cust-1",
    name: "Empresa de Prueba SA de CV",
    rfc: "EPR010101AAA",
    razon_social: "EMPRESA DE PRUEBA SA DE CV",
    regimen_fiscal: "601",
    domicilio_fiscal_cp: "06600",
    uso_cfdi: "G03",
    ...over,
  };
}

describe("cfdiFromCustomer", () => {
  it("mapea rfc, razon_social, regimen_fiscal y cp desde un customer completo", () => {
    const patch = cfdiFromCustomer(makeCustomer());
    expect(patch.receptorRfc).toBe("EPR010101AAA");
    expect(patch.receptorRazonSocial).toBe("EMPRESA DE PRUEBA SA DE CV");
    expect(patch.receptorRegimenFiscal).toBe("601");
    expect(patch.receptorDomicilioFiscalCp).toBe("06600");
  });

  it("incluye usoCfdi cuando el customer tiene uso_cfdi", () => {
    const patch = cfdiFromCustomer(makeCustomer({ uso_cfdi: "G03" }));
    expect(patch.usoCfdi).toBe("G03");
  });

  it("NO sobreescribe usoCfdi cuando customer.uso_cfdi es null", () => {
    const patch = cfdiFromCustomer(makeCustomer({ uso_cfdi: null }));
    expect(patch).not.toHaveProperty("usoCfdi");
  });

  it("NO sobreescribe usoCfdi cuando uso_cfdi es undefined", () => {
    const patch = cfdiFromCustomer(makeCustomer({ uso_cfdi: undefined }));
    expect(patch).not.toHaveProperty("usoCfdi");
  });

  it("fallback a customer.name cuando razon_social es null", () => {
    const patch = cfdiFromCustomer(makeCustomer({ razon_social: null }));
    expect(patch.receptorRazonSocial).toBe("Empresa de Prueba SA de CV");
  });

  it("rfc null → string vacío", () => {
    const patch = cfdiFromCustomer(makeCustomer({ rfc: null }));
    expect(patch.receptorRfc).toBe("");
  });

  it("cp null → string vacío", () => {
    const patch = cfdiFromCustomer(makeCustomer({ domicilio_fiscal_cp: null }));
    expect(patch.receptorDomicilioFiscalCp).toBe("");
  });
});

function makeQuote(over: Partial<SourceQuote> = {}): SourceQuote {
  return {
    customer_id: "cust-1",
    customer_name: "Empresa de Prueba SA de CV",
    line_items: [],
    tax_rate: 16,
    currency: "MXN",
    ...over,
  };
}

describe("buildFromQuote — taxRate", () => {
  it("preserva tax_rate = 0 (cliente exento) sin forzar 16 (regresión del bug)", () => {
    const form = buildFromQuote({ q: makeQuote({ tax_rate: 0 }), assignments: undefined, forklifts: undefined, customers: undefined });
    expect(form.taxRate).toBe(0);
  });

  it("preserva tax_rate = 8", () => {
    const form = buildFromQuote({ q: makeQuote({ tax_rate: 8 }), assignments: undefined, forklifts: undefined, customers: undefined });
    expect(form.taxRate).toBe(8);
  });

  it("preserva tax_rate = 16", () => {
    const form = buildFromQuote({ q: makeQuote({ tax_rate: 16 }), assignments: undefined, forklifts: undefined, customers: undefined });
    expect(form.taxRate).toBe(16);
  });

  it("usa 16 como default cuando tax_rate es null", () => {
    const form = buildFromQuote({ q: makeQuote({ tax_rate: null as unknown as number }), assignments: undefined, forklifts: undefined, customers: undefined });
    expect(form.taxRate).toBe(16);
  });

  it("usa 16 como default cuando tax_rate es undefined", () => {
    const form = buildFromQuote({ q: makeQuote({ tax_rate: undefined }), assignments: undefined, forklifts: undefined, customers: undefined });
    expect(form.taxRate).toBe(16);
  });

  it("hereda customerId, customerName, currency (USD) y lineItems", () => {
    const items = [{ description: "Renta", quantity: 1, unit_price: 1000 }];
    const form = buildFromQuote({
      q: makeQuote({ customer_id: "cust-2", customer_name: "Cliente USD", tax_rate: 0, currency: "USD", line_items: items }),
      assignments: undefined,
      forklifts: undefined,
      customers: undefined,
    });
    expect(form.customerId).toBe("cust-2");
    expect(form.customerName).toBe("Cliente USD");
    expect(form.cfdi.moneda).toBe("USD");
    expect(form.taxRate).toBe(0);
    expect(form.lineItems).toEqual(items);
  });
});
