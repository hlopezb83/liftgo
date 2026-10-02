import { afterEach, describe, expect, it, vi } from "vitest";
import { checkFacturapiConnection, checkReservedFacturapiConnection } from "../platformFacturapiHealth.server";

describe("comprobación Facturapi de plataforma", () => {
  afterEach(() => vi.unstubAllGlobals());
  it.each(["unconfigured", "duplicate_key", "invalid_key_mode"] as const)("no consulta al proveedor cuando la reserva indica %s", async (preflight) => {
    const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
    expect(await checkReservedFacturapiConnection({ preflight, apiKey: null })).toEqual({ status: preflight, latencyMs: null, httpStatus: null });
    expect(fetch).not.toHaveBeenCalled();
  });
  it("consulta el endpoint oficial una sola vez y devuelve sólo metadatos", async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: "provider-org", legal: { tax_id: "private" }, token: "private" }), { status: 200 }));
    vi.stubGlobal("fetch", fetch);
    expect(await checkFacturapiConnection("private-key")).toEqual({ status: "connected", latencyMs: expect.any(Number), httpStatus: 200 });
    expect(fetch).toHaveBeenCalledExactlyOnceWith("https://www.facturapi.io/v2/organizations/me", {
      method: "GET", headers: { Authorization: "Bearer private-key", Accept: "application/json" },
      signal: expect.any(AbortSignal), redirect: "error", cache: "no-store",
    });
  });
  it.each([[401,"auth_error"],[403,"auth_error"],[429,"rate_limited"],[503,"unavailable"],[404,"invalid_response"],[202,"invalid_response"]])("clasifica HTTP %i sin leer cuerpos fiscales ni reintentar", async (code, status) => {
    const json = vi.fn(); const cancel = vi.fn(); const fetch = vi.fn().mockResolvedValue({ status: code, json, body: { cancel } });
    vi.stubGlobal("fetch", fetch);
    expect(await checkFacturapiConnection("private-key")).toMatchObject({ status, httpStatus: code });
    expect(fetch).toHaveBeenCalledTimes(1); expect(json).not.toHaveBeenCalled(); expect(cancel).toHaveBeenCalledTimes(1);
  });
  it.each([{}, null, { id: "" }, { id: 5 }])("no acepta un HTTP 200 con cuerpo inválido", async (body) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify(body))));
    expect(await checkFacturapiConnection("private-key")).toMatchObject({ status: "invalid_response", httpStatus: 200 });
  });
  it("no expone errores de red ni secretos incluidos en el error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("Authorization private-key")));
    const result = await checkFacturapiConnection("private-key");
    expect(result).toMatchObject({ status: "unavailable", httpStatus: null });
    expect(JSON.stringify(result)).not.toContain("private-key");
  });
  it("rechaza HTML del proveedor", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("<html>error</html>")));
    expect(await checkFacturapiConnection("private-key")).toMatchObject({ status: "invalid_response", httpStatus: 200 });
  });
});
