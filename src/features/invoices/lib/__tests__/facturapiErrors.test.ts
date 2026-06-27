import { describe, it, expect } from "vitest";
import { translateFacturapiError, classifyFacturapiError } from "../facturapiErrors";

describe("classifyFacturapiError", () => {
  it("CFDI40148 → kind receptor_data", () => {
    expect(classifyFacturapiError("CFDI40148: DomicilioFiscalReceptor…").kind).toBe("receptor_data");
  });
  it("CSD expired → kind csd", () => {
    expect(classifyFacturapiError("certificate expired").kind).toBe("csd");
  });
  it("sin timbres → kind credits", () => {
    expect(classifyFacturapiError("insufficient credits").kind).toBe("credits");
  });
  it("invalid api key → kind auth", () => {
    expect(classifyFacturapiError("invalid api key").kind).toBe("auth");
  });
  it("folio duplicate → kind folio", () => {
    expect(classifyFacturapiError("folio duplicate").kind).toBe("folio");
  });
  it("desconocido → kind unknown", () => {
    expect(classifyFacturapiError("xyz unrelated").kind).toBe("unknown");
  });
  it("null → kind unknown", () => {
    expect(classifyFacturapiError(null).kind).toBe("unknown");
  });
});

describe("translateFacturapiError", () => {
  it("null → 'Error desconocido al timbrar.'", () => {
    expect(translateFacturapiError(null)).toBe("Error desconocido al timbrar.");
  });

  it("undefined → 'Error desconocido al timbrar.'", () => {
    expect(translateFacturapiError(undefined)).toBe("Error desconocido al timbrar.");
  });

  it("empty string → 'Error desconocido al timbrar.'", () => {
    expect(translateFacturapiError("")).toBe("Error desconocido al timbrar.");
  });

  it("CFDI40101 → mensaje de RFC obligatorio", () => {
    expect(translateFacturapiError("CFDI40101")).toBe(
      "El RFC del receptor es obligatorio y debe ser válido.",
    );
  });

  it("'RFC required' (case-insensitive) → mensaje de RFC", () => {
    expect(translateFacturapiError("RFC required for this operation")).toBe(
      "El RFC del receptor es obligatorio y debe ser válido.",
    );
  });

  it("'folio duplicate' → mensaje de folio duplicado", () => {
    expect(translateFacturapiError("folio duplicate")).toBe(
      "El folio ya fue usado. Genera un nuevo número de factura.",
    );
  });

  it("'folio already registered' → mensaje de folio duplicado", () => {
    expect(translateFacturapiError("folio already registered in SAT")).toBe(
      "El folio ya fue usado. Genera un nuevo número de factura.",
    );
  });

  it("CFDI40148 → mensaje de CP fiscal vs RFC", () => {
    expect(
      translateFacturapiError(
        "CFDI40148: El campo DomicilioFiscalReceptor del receptor, debe pertenecer al nombre asociado al RFC registrado en el campo Rfc del Receptor.",
      ),
    ).toMatch(/c[oó]digo postal fiscal del cliente no coincide/i);
  });

  it("mensaje SAT sin código → match por texto DomicilioFiscalReceptor", () => {
    expect(
      translateFacturapiError(
        "El campo DomicilioFiscalReceptor debe pertenecer al nombre asociado al RFC",
      ),
    ).toMatch(/Constancia de Situaci[oó]n Fiscal/);
  });



  it("mensaje > 200 chars sin match → truncado con '…'", () => {
    const long = "X".repeat(250);
    const result = translateFacturapiError(long);
    expect(result.endsWith("…")).toBe(true);
    expect([...result]).toHaveLength(201);
    expect(result.startsWith("X".repeat(200))).toBe(true);
  });

  it("mensaje de 200 chars sin match → sin truncar", () => {
    const exact = "Y".repeat(200);
    expect(translateFacturapiError(exact)).toBe(exact);
  });

  it("mensaje corto sin match → tal cual", () => {
    const short = "Some unknown error from Facturapi";
    expect(translateFacturapiError(short)).toBe(short);
  });
});
