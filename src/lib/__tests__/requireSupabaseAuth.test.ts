import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * TS-01 (lado servidor): los guards NO se relajan. Sin encabezado válido la
 * petición se rechaza antes de tocar el backend.
 */

const getRequest = vi.fn();
const getClaims = vi.fn();

vi.mock("@tanstack/react-start/server", () => ({ getRequest: () => getRequest() }));
vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({ auth: { getClaims: (t: string) => getClaims(t) } }),
}));

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type ServerFn = (ctx: { next: (o?: unknown) => unknown }) => Promise<unknown>;

function serverMiddleware(): ServerFn {
  return (requireSupabaseAuth as unknown as { options: { server: ServerFn } }).options.server;
}

function withHeaders(h: Record<string, string>) {
  getRequest.mockReturnValue({ headers: new Headers(h) });
}

describe("requireSupabaseAuth", () => {
  beforeEach(() => {
    getRequest.mockReset();
    getClaims.mockReset();
    process.env["SUPABASE_URL"] = "http://127.0.0.1:54321";
    process.env["SUPABASE_PUBLISHABLE_KEY"] = "sb_publishable_local";
  });

  it("rechaza cuando no llega Authorization", async () => {
    withHeaders({});
    await expect(serverMiddleware()({ next: vi.fn() })).rejects.toThrow(
      /No authorization header provided/,
    );
  });

  it("rechaza credenciales inválidas", async () => {
    withHeaders({ authorization: "Bearer a.b.c" });
    getClaims.mockResolvedValue({ data: null, error: new Error("bad") });
    await expect(serverMiddleware()({ next: vi.fn() })).rejects.toThrow(/Invalid token/);
  });

  it("acepta un Bearer válido y expone el userId", async () => {
    withHeaders({ authorization: "Bearer a.b.c" });
    getClaims.mockResolvedValue({ data: { claims: { sub: "user-1" } }, error: null });
    const next = vi.fn((o?: unknown) => o);
    const out = (await serverMiddleware()({ next })) as { context: { userId: string } };
    expect(out.context.userId).toBe("user-1");
  });
});
