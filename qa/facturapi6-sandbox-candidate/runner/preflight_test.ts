// Pruebas sin red: se ejecutan con permisos vacíos (sin --allow-net), por lo
// que cualquier fetch real fallaría. Todo el proveedor y la BD son dobles.
import { assert, assertEquals } from "@std/assert";
import { __resetInFlightForTests, handleRunner, type RunnerDeps } from "./preflight.ts";
import {
  checkTestKey,
  compareIssuer,
  parseAction,
  RUN_EXPIRES_AT,
  RUN_ID,
  TENANT_ORGANIZATION_ID,
} from "./policy.ts";

const OTHER_ORG = "00000000-0000-4000-8000-000000000000";
const TEST_KEY = "sk_test_FAKE_NOT_A_SECRET";

type Tables = Record<string, { data: unknown; error?: unknown }>;

function fakeDb(tables: Tables, writes: string[]) {
  return {
    from(table: string) {
      const res = tables[table] ?? { data: null, error: null };
      const chain: any = {
        select: () => chain,
        eq: () => chain,
        neq: () => chain,
        limit: () => Promise.resolve({ data: res.data, error: res.error ?? null }),
        maybeSingle: () =>
          Promise.resolve({
            data: Array.isArray(res.data) ? res.data[0] ?? null : res.data,
            error: res.error ?? null,
          }),
        then: (r: any, j: any) =>
          Promise.resolve({ data: res.data, error: res.error ?? null }).then(r, j),
      };
      for (const w of ["insert", "update", "upsert", "delete"]) {
        chain[w] = () => {
          writes.push(`${w}:${table}`);
          return chain;
        };
      }
      return chain;
    },
    rpc: (name: string) => {
      writes.push(`rpc:${name}`);
      return Promise.resolve({ data: null, error: null });
    },
  };
}

interface Opts {
  role?: string;
  org?: string;
  mode?: string;
  key?: string | null;
  otherOwner?: boolean;
  settingsRows?: number;
  issuer?: { legal_name?: string; tax_id?: string };
  meFails?: boolean;
  claims?: Record<string, unknown> | null;
  now?: number;
}

function setup(o: Opts = {}) {
  const writes: string[] = [];
  const meCalls: string[] = [];
  const settings = {
    facturapi_mode: o.mode ?? "test",
    razon_social: "ELOGISTIX SHIPPING",
    rfc: "EKU9003173C9",
  };
  // billing_secrets: la primera lectura devuelve la llave; la verificación de
  // exclusividad usa la misma tabla (neq). El doble devuelve sólo la llave o,
  // con otherOwner, una fila ajena para simular llave duplicada.
  let secretsReads = 0;
  const db = fakeDb({
    profiles: { data: [{ is_active: true }] },
    user_roles: { data: [{ role: o.role ?? "admin" }] },
    organization_memberships: {
      data: [{ organization_id: o.org ?? TENANT_ORGANIZATION_ID, member_type: "internal" }],
    },
    organizations: { data: [{ id: TENANT_ORGANIZATION_ID, is_active: true }] },
    company_settings: {
      data: Array.from({ length: o.settingsRows ?? 1 }, () => settings),
    },
  }, writes);
  const realFrom = db.from.bind(db);
  (db as any).from = (t: string) => {
    if (t !== "billing_secrets") return realFrom(t);
    secretsReads++;
    const first = secretsReads % 2 === 1;
    const data = first
      ? { facturapi_test_key: o.key === undefined ? TEST_KEY : o.key, facturapi_live_key: null }
      : (o.otherOwner ? { organization_id: OTHER_ORG } : null);
    const chain: any = {
      select: () => chain,
      eq: () => chain,
      neq: () => chain,
      maybeSingle: () => Promise.resolve({ data, error: null }),
    };
    return chain;
  };
  const deps: RunnerDeps = {
    createCallerClient: () => ({
      auth: {
        getClaims: () =>
          Promise.resolve({
            data: o.claims === null ? null : { claims: o.claims ?? { sub: "user-1", role: "authenticated" } },
            error: null,
          }),
      },
    }) as never,
    createServiceClient: () => db as never,
    env: () => undefined,
    now: () => o.now ?? Date.parse("2026-11-10T05:00:00Z"),
    createIssuerReader: (k) => ({
      me: () => {
        meCalls.push(k === TEST_KEY ? "test-key" : "other-key");
        if (o.meFails) return Promise.reject(new Error("boom"));
        return Promise.resolve({
          legal: o.issuer ?? { legal_name: "ELOGISTIX SHIPPING", tax_id: "EKU9003173C9" },
        });
      },
    }),
  };
  return { deps, writes, meCalls };
}

const req = (body: unknown, auth = "Bearer jwt") =>
  new Request("http://local/fx6", {
    method: "POST",
    headers: { Authorization: auth, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

const ok = { action: "preflight", run_id: RUN_ID };

async function run(o: Opts, body: unknown = ok, auth?: string) {
  __resetInFlightForTests();
  const s = setup(o);
  const res = await handleRunner(req(body, auth), s.deps);
  const json = await res.json();
  return { res, json, ...s };
}

Deno.test("preflight correcto: sólo booleanos, una lectura del emisor, cero escrituras", async () => {
  const { res, json, writes, meCalls } = await run({});
  assertEquals(res.status, 200);
  assertEquals(json.preflight_ok, true);
  assertEquals(meCalls, ["test-key"]);
  assertEquals(writes, []);
  const text = JSON.stringify(json);
  assert(!text.includes("sk_"), "la respuesta no debe contener la llave");
  assert(!text.includes("EKU9003173C9"), "la respuesta no debe contener el RFC");
});

Deno.test("bloquea otra empresa", async () => {
  const { res, json, meCalls } = await run({ org: OTHER_ORG });
  assertEquals([res.status, json.error], [403, "tenant_not_allowed"]);
  assertEquals(meCalls, []);
});

Deno.test("bloquea modo live y llave live", async () => {
  assertEquals((await run({ mode: "live" })).json.error, "mode_not_test");
  assertEquals(checkTestKey("test", "sk_live_x", false).ok, false);
  assertEquals(checkTestKey("test", "sk_user_x", false).ok, false);
  assertEquals(checkTestKey("test", TEST_KEY, true).ok, false);
});

Deno.test("bloquea configuración ambigua o ausente", async () => {
  assertEquals((await run({ settingsRows: 2 })).json.error, "company_settings_ambiguous");
  assertEquals((await run({ settingsRows: 0 })).json.error, "company_settings_ambiguous");
  assertEquals((await run({ key: null })).json.error, "key_not_test");
});

Deno.test("bloquea llave compartida con otra empresa (código del PR)", async () => {
  const { json, meCalls } = await run({ otherOwner: true });
  assertEquals(json.error, "config_duplicate_key");
  assertEquals(meCalls, []);
});

Deno.test("bloquea emisor discordante", async () => {
  const a = await run({ issuer: { legal_name: "OTRA SA", tax_id: "EKU9003173C9" } });
  assertEquals([a.res.status, a.json.issuer_legal_name_matches], [409, false]);
  const b = await run({ issuer: { legal_name: "ELOGISTIX SHIPPING", tax_id: "XAXX010101000" } });
  assertEquals([b.res.status, b.json.issuer_tax_id_matches], [409, false]);
  assertEquals(compareIssuer({ providerLegalName: "", providerTaxId: "", erpRazonSocial: "", erpRfc: "" }).taxIdMatches, false);
});

Deno.test("bloquea caller no autorizado", async () => {
  assertEquals((await run({}, ok, "")).res.status, 401);
  assertEquals((await run({ claims: null })).res.status, 401);
  assertEquals((await run({ role: "viewer" })).res.status, 403);
  assertEquals(
    (await run({ claims: { sub: "", role: "service_role" } })).json.error,
    "service_role_not_allowed",
  );
});

Deno.test("rechaza acciones, campos extra, run_id ajeno y fases no habilitadas", async () => {
  assertEquals(parseAction({ action: "preflight", run_id: RUN_ID, organization_id: OTHER_ORG }), null);
  assertEquals(parseAction({ action: "preflight", run_id: "otro" }), null);
  assertEquals(parseAction({ action: "delete_all", run_id: RUN_ID }), null);
  const r = await run({}, { action: "stamp_invoice", run_id: RUN_ID });
  assertEquals([r.res.status, r.json.error], [423, "phase_not_enabled"]);
  assertEquals(r.meCalls, []);
});

Deno.test("ejecución caducada responde 410 antes de autenticar", async () => {
  const r = await run({ now: RUN_EXPIRES_AT });
  assertEquals([r.res.status, r.json.error], [410, "run_expired"]);
  assertEquals(r.meCalls, []);
});

Deno.test("fallo del proveedor se detiene sin reintento", async () => {
  const r = await run({ meFails: true });
  assertEquals([r.res.status, r.json.error], [502, "issuer_read_failed"]);
  assertEquals(r.meCalls.length, 1);
});

Deno.test("segunda solicitud simultánea en el mismo isolate se rechaza", async () => {
  __resetInFlightForTests();
  const s = setup({});
  let release!: () => void;
  const gate = new Promise<void>((r) => (release = r));
  s.deps.createIssuerReader = () => ({
    me: async () => {
      await gate;
      return { legal: { legal_name: "ELOGISTIX SHIPPING", tax_id: "EKU9003173C9" } };
    },
  });
  const first = handleRunner(req(ok), s.deps);
  await new Promise((r) => setTimeout(r, 0));
  for (let i = 0; i < 20 && !(await Promise.race([first.then(() => true), Promise.resolve(false)])); i++) {
    const second = await handleRunner(req(ok), s.deps);
    if (second.status === 409) {
      assertEquals((await second.json()).error, "run_in_progress");
      release();
      assertEquals((await first).status, 200);
      return;
    }
    await second.body?.cancel();
  }
  release();
  throw new Error("no se observó rechazo concurrente");
});
