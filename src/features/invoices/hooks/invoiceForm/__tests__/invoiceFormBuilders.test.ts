import { describe, it, expect } from "vitest";
import { cfdiFromCustomer, type Customer } from "../invoiceFormBuilders";

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
