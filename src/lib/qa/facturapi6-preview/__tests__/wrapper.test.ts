import { describe, expect, it, vi } from "vitest";
import { handlePreviewPreflight, type WrapperDeps } from "../wrapper.server";
import { PREVIEW_WINDOW } from "../policy";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { verifyElogistixTestKeyExclusive } from "../exclusivity.server";
import { TENANT_ORGANIZATION_ID } from "../../../../../qa/facturapi6-sandbox-candidate/runner/policy";
const U = "11111111-1111-4111-8111-111111111111", S = "22222222-2222-4222-8222-222222222222";
function fullCaller() {
  const data: Record<string, unknown> = {
    profiles: [{ user_id: U, is_active: true }],
    organization_memberships: [{ organization_id: TENANT_ORGANIZATION_ID, member_type: "internal" }],
    organizations: [{ id: TENANT_ORGANIZATION_ID, is_active: true }],
    company_settings: [{ facturapi_mode: "test", razon_social: "ELOGISTIX SHIPPING", rfc: "AAA010101AAA" }],
  };
  const from = (table: string) => {
    const q = { select: () => q, eq: () => q, neq: () => q, limit: () => q,
      then: (f: (v: unknown) => unknown, r?: (e: unknown) => unknown) => Promise.resolve({ error: null, data: data[table] }).then(f, r) };
    return q;
  };
  return {
    from: vi.fn(from),
    auth: { getClaims: vi.fn(async () => ({ data: { claims: { role: "authenticated", sub: U, session_id: S } }, error: null })),
      getUser: vi.fn(async () => ({ data: { user: { id: U } }, error: null })) },
    rpc: vi.fn(async () => ({ data: true, error: null })),
  } as never as Awaited<ReturnType<WrapperDeps["createCaller"]>> & { auth: { getClaims: ReturnType<typeof vi.fn> } };
}
function exclusivity(onStage: (stage: "loadVerifier" | "loadClient") => void) {
  const rpc = vi.fn(async () => ({ data: true, error: null }));
  const loaders = {
    loadVerifier: vi.fn(async () => { await Promise.resolve(); onStage("loadVerifier"); return verifyElogistixTestKeyExclusive; }),
    loadClient: vi.fn(async () => { await Promise.resolve(); onStage("loadClient"); return { rpc }; }),
  };
  return { rpc, loaders };
}
const LIVE = "https://e25ace4a-172e-4082-a037-00473dacf2f2.lovableproject.com";
const open = { enabled: true, shutdown: false, runId: "offline-only", startsAt: 1_000, expiresAt: 7_201_000 };
function deps(over: Partial<WrapperDeps> = {}, headers: Record<string, string> = { authorization: "Bearer offline", origin: LIVE }) {
  const d: WrapperDeps = {
    window: open, development: true, now: () => 2_000,
    headers: { get: name => headers[name] ?? null },
    env: { url: "https://offline.invalid", publishableKey: "offline" },
    createCaller: vi.fn(async () => { throw new Error("caller_created"); }),
    loadSecretReader: vi.fn(async () => { throw new Error("secret_reader_loaded"); }),
    readIssuer: vi.fn(async () => { throw new Error("provider_called"); }),
    ...over,
  };
  return d;
}
const untouched = (d: WrapperDeps) => {
  expect(d.createCaller).not.toHaveBeenCalled();
  expect(d.loadSecretReader).not.toHaveBeenCalled();
  expect(d.readIssuer).not.toHaveBeenCalled();
};
describe("wrapper real del server function", () => {
  it("fuente actual apagada: 423 sin crear clientes", async () => {
    const d = deps({ window: PREVIEW_WINDOW });
    expect((await handlePreviewPreflight(d)).code).toBe("disabled"); untouched(d);
  });
  it("shutdown con ventana válida: 423 sin clientes", async () => {
    const d = deps({ window: { ...open, shutdown: true } });
    expect((await handlePreviewPreflight(d)).code).toBe("disabled"); untouched(d);
  });
  it("compilación no DEV (static/publicada): 403 sin clientes", async () => {
    const d = deps({ development: false });
    expect((await handlePreviewPreflight(d)).code).toBe("preview_only"); untouched(d);
  });
  it("ventana vencida: 410 sin clientes", async () => {
    const d = deps({ now: () => 7_201_000 });
    expect((await handlePreviewPreflight(d)).code).toBe("expired"); untouched(d);
  });
  it("sin bearer: 401 sin clientes", async () => {
    const d = deps({}, { origin: LIVE });
    expect((await handlePreviewPreflight(d)).code).toBe("unauthorized"); untouched(d);
  });
  it.each(["https://id-preview--e25ace4a-172e-4082-a037-00473dacf2f2.lovable.app", "https://liftgo.lovable.app", ""])(
    "origen %s rechazado sin secretos ni proveedor", async origin => {
      const caller = { from: vi.fn(), auth: { getClaims: vi.fn(), getUser: vi.fn() }, rpc: vi.fn() };
      const d = deps({ createCaller: vi.fn(async () => caller) }, { authorization: "Bearer offline", origin });
      expect((await handlePreviewPreflight(d)).code).toBe("preview_only");
      expect(caller.auth.getClaims).not.toHaveBeenCalled();
      expect(d.loadSecretReader).not.toHaveBeenCalled(); expect(d.readIssuer).not.toHaveBeenCalled();
    });
  it("origen live exacto con DEV llega a validar sesión; sin lector ni proveedor", async () => {
    const caller = {
      from: vi.fn(() => { throw new Error("no_db_in_this_test"); }),
      auth: { getClaims: vi.fn(async () => ({ data: null, error: "offline" })), getUser: vi.fn() },
      rpc: vi.fn(async () => ({ data: true, error: null })),
    };
    const d = deps({ createCaller: vi.fn(async () => caller) });
    expect((await handlePreviewPreflight(d)).code).toBe("unauthorized");
    expect(caller.auth.getClaims).toHaveBeenCalledTimes(1);
    expect(d.loadSecretReader).not.toHaveBeenCalled(); expect(d.readIssuer).not.toHaveBeenCalled();
  });
});
describe("wiring del verificador", () => {
  it("apagado: no carga verificador", async () => {
    const ex = exclusivity(() => {});
    const d = deps({ window: PREVIEW_WINDOW, exclusivity: ex.loaders });
    expect((await handlePreviewPreflight(d)).code).toBe("disabled");
    expect(ex.loaders.loadVerifier).not.toHaveBeenCalled(); expect(ex.rpc).not.toHaveBeenCalled(); untouched(d);
  });
  it.each(["loadVerifier", "loadClient"] as const)("vence durante %s diferido: RPC 0, sin secreto ni proveedor, 410", async stage => {
    const clock = { t: 2_000 };
    const ex = exclusivity(s => { if (s === stage) clock.t = 7_201_000; });
    const d = deps({ now: () => clock.t, createCaller: vi.fn(async () => fullCaller()), exclusivity: ex.loaders });
    expect((await handlePreviewPreflight(d)).code).toBe("expired");
    expect(ex.loaders.loadVerifier).toHaveBeenCalledTimes(1);
    expect(ex.loaders.loadClient).toHaveBeenCalledTimes(stage === "loadClient" ? 1 : 0);
    expect(ex.rpc).toHaveBeenCalledTimes(0);
    expect(d.loadSecretReader).not.toHaveBeenCalled(); expect(d.readIssuer).not.toHaveBeenCalled();
  });
  it("ventana abierta: el mismo wiring llama RPC exacto sin argumentos una vez", async () => {
    const ex = exclusivity(() => {});
    const d = deps({ createCaller: vi.fn(async () => fullCaller()), exclusivity: ex.loaders });
    await handlePreviewPreflight(d);
    expect(ex.rpc).toHaveBeenCalledTimes(1);
    expect(ex.rpc).toHaveBeenCalledWith("qa_fx6_elogistix_test_key_is_exclusive");
    expect(d.loadSecretReader).toHaveBeenCalledTimes(1); // doble que lanza: nunca hay secreto real
    expect(d.readIssuer).not.toHaveBeenCalled();
  });
  it("vence durante createCaller diferido: sin sesión ni verificador", async () => {
    const clock = { t: 2_000 }; const caller = fullCaller(); const ex = exclusivity(() => {});
    const d = deps({ now: () => clock.t, createCaller: vi.fn(async () => { await Promise.resolve(); clock.t = 7_201_000; return caller; }), exclusivity: ex.loaders });
    expect((await handlePreviewPreflight(d)).code).toBe("expired");
    expect(caller.auth.getClaims).not.toHaveBeenCalled(); expect(ex.loaders.loadVerifier).not.toHaveBeenCalled();
  });
  it("preflight.functions conecta loaders al wrapper (sin llamar RPC directo)", () => {
    const src = readFileSync(resolve(__dirname, "../preflight.functions.ts"), "utf8");
    expect(src).toContain("exclusivity: {");
    expect(src).not.toContain("verifyKeyExclusive");
    expect(src).not.toMatch(/\.rpc\(/);
  });
});
