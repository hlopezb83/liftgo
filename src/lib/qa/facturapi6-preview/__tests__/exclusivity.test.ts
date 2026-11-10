import { describe, expect, it, vi } from "vitest";
import { EXCLUSIVITY_RPC, verifyElogistixTestKeyExclusive } from "../exclusivity.server";
describe("contrato RPC de exclusividad", () => {
  it("llama sin argumentos y sólo acepta true literal", async () => {
    const rpc = vi.fn(async () => ({ data: true, error: null }));
    expect(await verifyElogistixTestKeyExclusive({ rpc })).toBe(true);
    expect(rpc).toHaveBeenCalledWith(EXCLUSIVITY_RPC);
    expect(rpc.mock.calls[0]).toHaveLength(1);
  });
  it.each([
    { data: false, error: null }, { data: "true", error: null }, { data: 1, error: null },
    { data: null, error: null }, { data: true, error: { code: "42883" } },
  ])("%o => false", async result => {
    expect(await verifyElogistixTestKeyExclusive({ rpc: async () => result })).toBe(false);
  });
  it("excepción => false", async () => {
    expect(await verifyElogistixTestKeyExclusive({ rpc: async () => { throw new Error("offline"); } })).toBe(false);
  });
});
