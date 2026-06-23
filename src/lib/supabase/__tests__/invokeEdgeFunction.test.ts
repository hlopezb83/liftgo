import { describe, it, expect, vi, beforeEach } from "vitest";

const invokeMock = vi.fn();

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { functions: { invoke: invokeMock } },
}));

import { invokeEdgeFunction } from "../invokeEdgeFunction";

function makeResponse(status: number, body: string): Response {
  return new Response(body, { status });
}

describe("invokeEdgeFunction", () => {
  beforeEach(() => {
    invokeMock.mockReset();
  });

  it("devuelve data en caso de éxito", async () => {
    invokeMock.mockResolvedValue({ data: { cfdi_uuid: "X" }, error: null });
    const out = await invokeEdgeFunction<{ cfdi_uuid: string }>("stamp-cfdi", {
      body: {},
    });
    expect(out.cfdi_uuid).toBe("X");
  });

  it("extrae body.error JSON de error.context", async () => {
    const ctx = makeResponse(409, JSON.stringify({ error: "Invoice already stamped" }));
    const err: Error & { context?: Response } = new Error(
      "Edge Function returned a non-2xx status code",
    );
    err.context = ctx;
    invokeMock.mockResolvedValue({ data: null, error: err });
    await expect(invokeEdgeFunction("stamp-cfdi", { body: {} })).rejects.toThrow(
      "Invoice already stamped",
    );
  });

  it("hace fallback a texto cuando el body no es JSON", async () => {
    const ctx = makeResponse(500, "internal boom");
    const err: Error & { context?: Response } = new Error("Edge Function returned a non-2xx status code");
    err.context = ctx;
    invokeMock.mockResolvedValue({ data: null, error: err });
    await expect(invokeEdgeFunction("x", {})).rejects.toThrow("internal boom");
  });

  it("hace fallback al message original cuando no hay context", async () => {
    invokeMock.mockResolvedValue({ data: null, error: { message: "network down" } });
    await expect(invokeEdgeFunction("x", {})).rejects.toThrow("network down");
  });

  it("propaga data.error cuando el SDK no marcó error", async () => {
    invokeMock.mockResolvedValue({ data: { error: "Invalid RFC" }, error: null });
    await expect(invokeEdgeFunction("stamp-cfdi", { body: {} })).rejects.toThrow(
      "Invalid RFC",
    );
  });
});
