import { describe, expect, it } from "vitest";
import { isStorageDenial } from "../../tests/multi-tenant-ab/fixtures/denialContract";

describe("contrato de denegación de Storage", () => {
  it("acepta ocultación de un objeto y rechazo RLS de escritura", () => {
    expect(isStorageDenial({ status: 400, message: "Object not found" }, "read")).toBe(true);
    expect(isStorageDenial({ statusCode: "403", message: "new row violates row-level security policy" }, "write")).toBe(true);
  });
  it.each([
    { status: 500, message: "Object not found" },
    { status: 400, message: "Invalid request" },
    { status: 401, message: "Invalid API key" },
    { status: 409, message: "The resource already exists" },
  ])("rechaza fallos de infraestructura o payload: %j", (error) => {
    expect(isStorageDenial(error, "read")).toBe(false);
    expect(isStorageDenial(error, "write")).toBe(false);
  });
});
