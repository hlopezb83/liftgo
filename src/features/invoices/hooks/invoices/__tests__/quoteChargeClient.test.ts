import { beforeEach, describe, expect, it, vi } from "vitest";
import { createQuoteChargeClient } from "../quoteChargeClient";

const { getSession, createClient } = vi.hoisted(() => ({
  getSession: vi.fn(),
  createClient: vi.fn(),
}));
vi.mock("@supabase/supabase-js", () => ({ createClient }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { auth: { getSession } } }));

describe("contrato local de cargos", () => {
  beforeEach(() => vi.clearAllMocks());
  it("reutiliza la sesión actual sin crear otra sesión", async () => {
    getSession.mockResolvedValue({ data: { session: { access_token: "test-token" } }, error: null });
    createQuoteChargeClient();
    const options = createClient.mock.calls[0]?.[2];
    expect(options).toEqual({ accessToken: expect.any(Function) });
    expect(await options.accessToken()).toBe("test-token");
    getSession.mockResolvedValue({ data: { session: null }, error: null });
    expect(await options.accessToken()).toBeNull();
  });
  it("propaga un error de sesión en lugar de continuar anónimamente", async () => {
    const error = new Error("sesión no disponible");
    getSession.mockResolvedValue({ data: { session: null }, error });
    createQuoteChargeClient();
    const options = createClient.mock.calls[0]?.[2];
    await expect(options.accessToken()).rejects.toBe(error);
  });
});