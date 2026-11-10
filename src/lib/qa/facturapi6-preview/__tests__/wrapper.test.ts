import { describe, expect, it, vi } from "vitest";
import { handlePreviewPreflight, type WrapperDeps } from "../wrapper.server";
import { PREVIEW_WINDOW } from "../policy";
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
  it("origen live exacto avanza hasta exclusividad bloqueada, sin lector ni proveedor", async () => {
    const ok = { then: (f: (v: unknown) => unknown) => Promise.resolve({ data: true, error: null }).then(f) };
    const caller = {
      from: vi.fn(() => { throw new Error("no_db_in_this_test"); }),
      auth: { getClaims: vi.fn(async () => ({ data: null, error: "offline" })), getUser: vi.fn() },
      rpc: vi.fn(() => ok),
    };
    const d = deps({ createCaller: vi.fn(async () => caller) });
    expect((await handlePreviewPreflight(d)).code).toBe("unauthorized");
    expect(caller.auth.getClaims).toHaveBeenCalledTimes(1);
    expect(d.loadSecretReader).not.toHaveBeenCalled(); expect(d.readIssuer).not.toHaveBeenCalled();
  });
});
