import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * TS-01: el transporte de las server functions debe llevar el access_token
 * de la sesión en el encabezado Authorization (nunca en URL ni en el payload).
 */

const getSession = vi.fn();

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { auth: { getSession: () => getSession() } },
}));

import { attachSupabaseAuth } from "@/lib/authAttacher";

type ClientFn = (ctx: { next: (opts?: { headers?: Record<string, string> }) => unknown }) => Promise<unknown>;

function clientMiddleware(): ClientFn {
  const opts = (attachSupabaseAuth as unknown as { options: { client: ClientFn } }).options;
  return opts.client;
}

describe("attachSupabaseAuth (transporte de server functions)", () => {
  beforeEach(() => {
    getSession.mockReset();
  });

  it("adjunta el Bearer vigente cuando hay sesión", async () => {
    getSession.mockResolvedValue({ data: { session: { access_token: "jwt.header.sig" } } });
    const next = vi.fn((o?: { headers?: Record<string, string> }) => o);
    const out = (await clientMiddleware()({ next })) as { headers?: Record<string, string> };
    expect(out?.headers?.Authorization).toBe("Bearer jwt.header.sig");
  });

  it("no inventa credenciales cuando no hay sesión", async () => {
    getSession.mockResolvedValue({ data: { session: null } });
    const next = vi.fn((o?: { headers?: Record<string, string> }) => o);
    const out = (await clientMiddleware()({ next })) as { headers?: Record<string, string> } | undefined;
    expect(out?.headers).toBeUndefined();
    expect(next).toHaveBeenCalledWith();
  });

  it("nunca coloca el token fuera del encabezado", async () => {
    getSession.mockResolvedValue({ data: { session: { access_token: "secreto.jwt.token" } } });
    const next = vi.fn((o?: Record<string, unknown>) => o);
    const out = (await clientMiddleware()({ next })) as Record<string, unknown>;
    expect(Object.keys(out)).toEqual(["headers"]);
  });
});

describe("registro global del adjuntador", () => {
  it("startInstance registra el middleware de función una sola vez", async () => {
    const [{ readFileSync }, { resolve }] = await Promise.all([
      import("node:fs"),
      import("node:path"),
    ]);
    const src = readFileSync(resolve(process.cwd(), "src/start.ts"), "utf8");
    expect(src).toMatch(/functionMiddleware:\s*\[attachSupabaseAuth\]/);
    expect(src.match(/attachSupabaseAuth/g)?.length).toBe(2);
  });
});
