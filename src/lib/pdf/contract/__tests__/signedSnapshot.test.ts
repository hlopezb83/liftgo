import { describe, expect, it } from "vitest";
import { readSignedSnapshot, type ContractData } from "../fetchers";

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
});
