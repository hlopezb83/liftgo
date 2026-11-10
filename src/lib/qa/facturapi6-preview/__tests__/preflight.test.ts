import { describe, expect, it, vi, afterEach } from "vitest";
import { runReadOnlyPreflight, type Caller, type ReadDb, type ReadQuery, type ReadResult } from "../core.server";
import { readSdk6Issuer } from "../sdk.server";
import { MAX_TTL_MS, PREVIEW_WINDOW, windowOpen } from "../policy";
import { TENANT_ORGANIZATION_ID } from "../../../../../qa/facturapi6-sandbox-candidate/runner/policy";
const user = "11111111-1111-4111-8111-111111111111";
const session = "22222222-2222-4222-8222-222222222222";
const window = { enabled: true, shutdown: false, runId: "offline-only", startsAt: 1_000, expiresAt: 7_201_000 };
function fixture() {
  const data: Record<string, unknown> = {
    profiles: [{ user_id: user, is_active: true }],
    organization_memberships: [{ organization_id: TENANT_ORGANIZATION_ID, member_type: "internal" }],
    organizations: [{ id: TENANT_ORGANIZATION_ID, is_active: true }],
    company_settings: [{ facturapi_mode: "test", razon_social: "ELOGISTIX SHIPPING", rfc: "AAA010101AAA" }],
  };
  const calls: string[] = [];
  const secretData = { own: [{ facturapi_test_key: "sk_test_OFFLINE_FIXTURE" }], other: [] as Record<string, unknown>[] };
  function db(secret = false): ReadDb {
    return { from(table) {
      let other = false;
      const q: ReadQuery = {
        select(columns) { calls.push(`${table}:${columns}`); return q; },
        eq() { return q; }, neq() { other = true; return q; }, limit() { return q; },
        then(onfulfilled, onrejected) {
          const value: ReadResult = { error: null, data: secret ? (other ? secretData.other : secretData.own) : data[table] };
          return Promise.resolve(value).then(onfulfilled, onrejected);
        },
      };
      return q;
    } };
  }
  const caller: Caller = {
    ...db(),
    auth: {
      getClaims: vi.fn(async () => ({ data: { claims: { role: "authenticated", sub: user, session_id: session } }, error: null })),
      getUser: vi.fn(async () => ({ data: { user: { id: user } }, error: null })),
    },
    rpc: vi.fn(async () => ({ data: true, error: null })),
  };
  const deps = {
    now: vi.fn(() => 2_000), window, development: true, origin: "https://e25ace4a-172e-4082-a037-00473dacf2f2.lovableproject.com", token: "offline-double",
    caller, loadSecretReader: vi.fn(async () => db(true)),
    verifyKeyExclusive: vi.fn(async () => true) as (() => Promise<boolean>) | undefined,
    readIssuer: vi.fn(async (_key: string, _signal: AbortSignal) => ({ legal: { legal_name: "ELOGISTIX SHIPPING", tax_id: "AAA010101AAA" } })),
  };
  return { deps, data, calls, secretData };
}
afterEach(() => vi.unstubAllGlobals());
describe("ventana Preview cerrada", () => {
  it("viene apagada; cero auth, secretos o proveedor", async () => {
    const { deps } = fixture(); deps.window = { ...PREVIEW_WINDOW };
    expect((await runReadOnlyPreflight(deps)).code).toBe("disabled");
    expect(deps.caller.auth.getClaims).not.toHaveBeenCalled();
    expect(deps.loadSecretReader).not.toHaveBeenCalled(); expect(deps.readIssuer).not.toHaveBeenCalled();
  });
  it("TTL máximo exactamente dos horas", () => {
    expect(MAX_TTL_MS).toBe(7_200_000);
    expect(windowOpen(window, 2_000)).toBe(true);
    expect(windowOpen({ ...window, expiresAt: window.expiresAt + 1 }, 2_000)).toBe(false);
  });
  it.each([999, 7_201_000, NaN])("fuera de ventana %s no autentica", async now => {
    const { deps } = fixture(); deps.now.mockReturnValue(now);
    expect((await runReadOnlyPreflight(deps)).code).toBe("expired");
    expect(deps.caller.auth.getClaims).not.toHaveBeenCalled();
  });
  it("shutdown bloquea una ventana válida", async () => {
    const { deps } = fixture(); deps.window = { ...window, shutdown: true };
    expect((await runReadOnlyPreflight(deps)).code).toBe("disabled");
    expect(deps.readIssuer).not.toHaveBeenCalled();
  });
  it.each([
    "https://liftgo.lovable.app", "https://attacker.invalid", "null", "",
    "https://id-preview--e25ace4a-172e-4082-a037-00473dacf2f2.lovable.app",
    "http://e25ace4a-172e-4082-a037-00473dacf2f2.lovableproject.com",
    "https://e25ace4a-172e-4082-a037-00473dacf2f2.lovableproject.com:8443",
    "https://e25ace4a-172e-4082-a037-00473dacf2f2.lovableproject.com/",
    "https://x.e25ace4a-172e-4082-a037-00473dacf2f2.lovableproject.com",
    "https://e25ace4a-172e-4082-a037-00473dacf2f2.lovableproject.com.attacker.invalid",
    "https://E25ACE4A-172E-4082-A037-00473DACF2F2.LOVABLEPROJECT.COM",
    "https://e25ace4a-172e-4082-a037-00473dacf2f3.lovableproject.com",
    "https://e25ace4a-172e-4082-a037-00473dacf2f2.lovableproject-dev.com",
  ])("rechaza origen %s", async origin => {
    const { deps } = fixture(); deps.origin = origin;
    expect((await runReadOnlyPreflight(deps)).code).toBe("preview_only"); expect(deps.loadSecretReader).not.toHaveBeenCalled();
  });
  it.each([
    "https://e25ace4a-172e-4082-a037-00473dacf2f2.lovableproject.com", "http://localhost:8080",
  ])("compilación no DEV (static/producción) denegada aun con origen %s", async origin => {
    const { deps } = fixture(); deps.development = false; deps.origin = origin;
    expect((await runReadOnlyPreflight(deps)).code).toBe("preview_only");
  });
});
describe("sesión y pertenencia antes de credenciales", () => {
  it("sin bearer no consulta", async () => {
    const { deps } = fixture(); deps.token = "";
    expect((await runReadOnlyPreflight(deps)).status).toBe(401); expect(deps.loadSecretReader).not.toHaveBeenCalled();
  });
  it.each([
    { role: "authenticated", sub: user },
    { role: "service_role", sub: user, session_id: session },
    { role: "authenticated", sub: user, session_id: "bad" },
    { role: "authenticated", sub: "bad", session_id: session },
  ])("rechaza claims no humanos o sin sesión", async claims => {
    const { deps } = fixture(); vi.mocked(deps.caller.auth.getClaims).mockResolvedValue({ data: { claims }, error: null });
    expect((await runReadOnlyPreflight(deps)).status).toBe(401); expect(deps.loadSecretReader).not.toHaveBeenCalled();
  });
  it("getClaims error no usa fallback", async () => {
    const { deps } = fixture(); vi.mocked(deps.caller.auth.getClaims).mockResolvedValue({ data: null, error: "offline" });
    expect((await runReadOnlyPreflight(deps)).status).toBe(401); expect(deps.caller.auth.getUser).not.toHaveBeenCalled();
  });
  it.each(["getClaims", "getUser"] as const)("excepción de %s es 401 sin credenciales", async method => {
    const { deps } = fixture(); vi.mocked(deps.caller.auth[method]).mockRejectedValue(new Error("offline"));
    expect((await runReadOnlyPreflight(deps)).status).toBe(401);
    expect(deps.loadSecretReader).not.toHaveBeenCalled();
  });
  it.each([{ data: { user: { id: session } }, error: null }, { data: null, error: "offline" }])("getUser debe coincidir", async result => {
    const { deps } = fixture(); vi.mocked(deps.caller.auth.getUser).mockResolvedValue(result);
    expect((await runReadOnlyPreflight(deps)).status).toBe(401); expect(deps.loadSecretReader).not.toHaveBeenCalled();
  });
  it.each([
    ["profiles", []], ["profiles", [{ user_id: user, is_active: false }]],
    ["profiles", [{ user_id: user, is_active: null }]],
    ["organization_memberships", []],
    ["organization_memberships", [{ organization_id: session, member_type: "internal" }]],
    ["organization_memberships", [{ organization_id: TENANT_ORGANIZATION_ID, member_type: "portal" }]],
    ["organization_memberships", [{ organization_id: TENANT_ORGANIZATION_ID, member_type: "internal" }, { organization_id: session, member_type: "internal" }]],
    ["organizations", [{ id: TENANT_ORGANIZATION_ID, is_active: false }]],
  ])("rechaza %s inconsistente", async (table, value) => {
    const { deps, data } = fixture(); data[String(table)] = value;
    expect((await runReadOnlyPreflight(deps)).status).toBe(401); expect(deps.loadSecretReader).not.toHaveBeenCalled();
  });
  it("no admin denegado", async () => {
    const { deps } = fixture(); vi.mocked(deps.caller.rpc).mockResolvedValue({ data: false, error: null });
    expect((await runReadOnlyPreflight(deps)).status).toBe(401); expect(deps.loadSecretReader).not.toHaveBeenCalled();
  });
});
describe("sólo configuración test y GET", () => {
  it.each(["sk_live_OFFLINE", "sk_test_", ""])("llave inválida no llega al proveedor", async key => {
    const { deps, secretData } = fixture(); secretData.own = [{ facturapi_test_key: key }];
    expect((await runReadOnlyPreflight(deps)).code).toBe("configuration_rejected");
    expect(deps.readIssuer).not.toHaveBeenCalled();
  });
  it("sin mecanismo de exclusividad: bloqueo explícito antes de leer llave", async () => {
    const { deps } = fixture(); deps.verifyKeyExclusive = undefined;
    expect(await runReadOnlyPreflight(deps)).toEqual({ ok: false, status: 409, code: "exclusivity_unavailable" });
    expect(deps.loadSecretReader).not.toHaveBeenCalled(); expect(deps.readIssuer).not.toHaveBeenCalled();
  });
  it.each([false, undefined])("exclusividad %s bloquea sin leer llave", async value => {
    const { deps } = fixture(); deps.verifyKeyExclusive = vi.fn(async () => value as boolean);
    expect((await runReadOnlyPreflight(deps)).code).toBe("configuration_rejected");
    expect(deps.loadSecretReader).not.toHaveBeenCalled();
  });
  it("la llave nunca viaja como filtro de consulta", async () => {
    const eqValues: unknown[] = []; const { deps } = fixture();
    deps.loadSecretReader = vi.fn(async () => ({ from() {
      const q: ReadQuery = { select() { return q; }, eq(_c, v) { eqValues.push(v); return q; },
        neq(_c, v) { eqValues.push(v); return q; }, limit() { return q; },
        then(f, r) { return Promise.resolve({ error: null, data: [{ facturapi_test_key: "sk_test_OFFLINE_FIXTURE" }] }).then(f, r); } };
      return q;
    } }));
    expect((await runReadOnlyPreflight(deps)).code).toBe("verified");
    expect(eqValues).toEqual([TENANT_ORGANIZATION_ID]);
  });
  it("dos filas de credenciales bloqueadas", async () => {
    const { deps, secretData } = fixture(); secretData.own = [...secretData.own, ...secretData.own];
    expect((await runReadOnlyPreflight(deps)).code).toBe("configuration_rejected");
    expect(deps.readIssuer).not.toHaveBeenCalled();
  });
  it("timeout limitado al tiempo restante, sin retry", async () => {
    vi.useFakeTimers();
    try {
      const { deps } = fixture(); deps.now.mockReturnValue(7_200_950);
      deps.readIssuer.mockImplementation((_key, signal) => new Promise((_resolve, reject) => {
        signal.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
      }));
      const result = runReadOnlyPreflight(deps);
      await vi.advanceTimersByTimeAsync(49); expect(deps.readIssuer).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(1); expect((await result).code).toBe("unavailable");
      expect(deps.readIssuer).toHaveBeenCalledTimes(1);
    } finally { vi.useRealTimers(); }
  });
  it.each(["live", null, "ambiguous"])("modo %s antes de secretos", async mode => {
    const { deps, data } = fixture(); data.company_settings = [{ facturapi_mode: mode }];
    expect((await runReadOnlyPreflight(deps)).code).toBe("configuration_rejected"); expect(deps.loadSecretReader).not.toHaveBeenCalled();
  });
  it("éxito sólo booleanos; sin llave, RFC ni IDs en respuesta", async () => {
    const { deps, calls } = fixture(); const result = await runReadOnlyPreflight(deps);
    expect(result).toEqual({ ok: true, status: 200, code: "verified", issuerMatches: true, sandboxConfirmed: true });
    expect(calls.filter(c => c.includes("billing_secrets"))).toEqual(["billing_secrets:facturapi_test_key"]);
    expect(deps.readIssuer).toHaveBeenCalledTimes(1);
  });
  it("emisor discordante se detiene", async () => {
    const { deps } = fixture(); deps.readIssuer.mockResolvedValue({ legal: { legal_name: "OTHER", tax_id: "AAA010101AAA" } });
    expect((await runReadOnlyPreflight(deps)).code).toBe("issuer_mismatch");
  });
  it("expiración justo antes del proveedor evita GET", async () => {
    const { deps } = fixture(); deps.now.mockReturnValueOnce(2_000).mockReturnValueOnce(2_000).mockReturnValue(7_201_000);
    expect((await runReadOnlyPreflight(deps)).code).toBe("expired"); expect(deps.readIssuer).not.toHaveBeenCalled();
  });
  it("errores secretos no salen ni reintentan", async () => {
    const { deps } = fixture(); deps.readIssuer.mockRejectedValue(new Error("NEVER_RETURN_RAW"));
    const result = await runReadOnlyPreflight(deps);
    expect(result).toEqual({ ok: false, status: 503, code: "unavailable" }); expect(deps.readIssuer).toHaveBeenCalledTimes(1);
  });
  it("SDK6 real GET y señal aislada, red sustituida", async () => {
    const ac = new AbortController();
    const fetchDouble = vi.fn(async (_input: unknown, init?: RequestInit) => {
      expect(init?.method).toBe("GET"); expect(init?.signal).toBe(ac.signal);
      expect(init?.redirect).toBe("error"); expect(init?.cache).toBe("no-store");
      return new Response(JSON.stringify({ legal: { legal_name: "OFFLINE" } }), { headers: { "Content-Type": "application/json" } });
    });
    vi.stubGlobal("fetch", fetchDouble);
    await readSdk6Issuer("sk_test_OFFLINE_FIXTURE", ac.signal);
    expect(fetchDouble).toHaveBeenCalledTimes(1);
    expect(fetchDouble.mock.calls[0]?.[0]).toBe("https://www.facturapi.io/v2/organizations/me");
  });
  it("SDK6 pre-abort impide fetch", async () => {
    const double = vi.fn(); vi.stubGlobal("fetch", double);
    const ac = new AbortController(); ac.abort();
    await expect(readSdk6Issuer("sk_test_OFFLINE_FIXTURE", ac.signal)).rejects.toThrow();
    expect(double).not.toHaveBeenCalled();
  });
});
