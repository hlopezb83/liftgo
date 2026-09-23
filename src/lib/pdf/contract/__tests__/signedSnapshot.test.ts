import { describe, expect, it } from "vitest";
import { contractForPdf, issuerForPdf, readSignedSnapshot, type ContractData } from "../fetchers";

function contract(status: string, snapshot: unknown = { customer: { name: "Cliente congelado" } }) {
  return { status, signed_snapshot: snapshot } as unknown as ContractData;
}

describe("readSignedSnapshot (bloque 2 · C)", () => {
  it("usa la copia congelada en firmado, activo y completado", () => {
    for (const status of ["signed", "active", "completed"]) {
      expect(readSignedSnapshot(contract(status))?.customer).toEqual({ name: "Cliente congelado" });
    }
  });

  it("lee datos vivos en borrador, enviado y cancelado", () => {
    for (const status of ["draft", "sent", "cancelled"]) {
      expect(readSignedSnapshot(contract(status))).toBeNull();
    }
  });

  it("regresa a datos vivos si el contrato no tiene copia", () => {
    expect(readSignedSnapshot(contract("completed", null))).toBeNull();
  });

  it("imprime los términos y el emisor tal como estaban al firmar", () => {
    const signed = {
      ...contract("signed", {
        contract: { contract_number: "CTR-001", monthly_rate: 12000, usage_location: "Apodaca" },
        issuer: {
          razon_social: "LiftGo A", rfc: "AAA010101AAA",
          regimen_fiscal: "601", lugar_expedicion: "64000",
        },
      }),
      contract_number: "CTR-EDITADO",
      monthly_rate: 99000,
      usage_location: "Otra ciudad",
    } as ContractData;
    const current = {
      razon_social: "LiftGo A Renovada", rfc: "AAA020202BBB",
      regimen_fiscal: "626", lugar_expedicion: "65000",
    };

    expect(contractForPdf(signed)).toMatchObject({
      contract_number: "CTR-001", monthly_rate: 12000, usage_location: "Apodaca",
    });
    expect(issuerForPdf(signed, current)).toMatchObject({
      razon_social: "LiftGo A", rfc: "AAA010101AAA", lugar_expedicion: "64000",
    });
  });

  it("mantiene compatibilidad con snapshots históricos sin emisor", () => {
    const current = {
      razon_social: "LiftGo actual", rfc: "AAA010101AAA",
      regimen_fiscal: "601", lugar_expedicion: "64000",
    };
    expect(issuerForPdf(contract("signed"), current)).toBe(current);
  });

  it("rechaza un emisor incompleto en un snapshot nuevo", () => {
    const current = {
      razon_social: "LiftGo actual", rfc: "AAA010101AAA",
      regimen_fiscal: "601", lugar_expedicion: "64000",
    };
    expect(() => issuerForPdf(contract("signed", { issuer: { rfc: "otro" } }), current))
      .toThrow("respaldo fiscal");
  });
});

