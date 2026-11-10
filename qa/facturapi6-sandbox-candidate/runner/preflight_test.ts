// Pruebas sin red: se ejecutan sin --allow-net, por lo que cualquier fetch
// real fallaría. Todo el proveedor y la BD son dobles.
import { assert, assertEquals } from "@std/assert";
import type { SupabaseLike } from "../snapshot/supabase/functions/_shared/types.ts";
import type { CallerClientLike, Db, DbResult, Query } from "./db.ts";
import {
  __resetInFlightForTests,
  handleRunner,
  type RunnerDeps,
} from "./preflight.ts";
import {
  checkTestKey,
  compareIssuer,
  parseAction,
  PROVIDER_TIMEOUT_MS,
  providerDeadlineMs,
  RUN_EXPIRES_AT,
  RUN_ID,
  RUN_NOT_BEFORE,
  TENANT_ORGANIZATION_ID,
} from "./policy.ts";

const OTHER_ORG = "00000000-0000-4000-8000-000000000000";
const TEST_KEY = "sk_test_FAKE_NOT_A_SECRET";
const USER_ID = "11111111-1111-4111-8111-111111111111";
const SESSION_ID = "55555555-5555-4555-8555-555555555555";

type FakeQuery = Query & {
  insert(): FakeQuery;
  update(): FakeQuery;
  upsert(): FakeQuery;
  delete(): FakeQuery;
};

function query(
  res: DbResult,
  writes: string[],
  table: string,
  onSelect?: (c: string) => void,
): FakeQuery {
  const self: FakeQuery = {
    select(c: string) {
      onSelect?.(c);
      return self;
    },
    eq: () => self,
    neq: () => self,
    limit: () => self,
    maybeSingle: () =>
      Promise.resolve({
        data: Array.isArray(res.data) ? res.data[0] ?? null : res.data,
        error: res.error,
      }),
    then(ok, ko) {
      return Promise.resolve(res).then(ok, ko);
    },
    insert: () => (writes.push(`insert:${table}`), self),
    update: () => (writes.push(`update:${table}`), self),
    upsert: () => (writes.push(`upsert:${table}`), self),
    delete: () => (writes.push(`delete:${table}`), self),
  };
  return self;
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
  getUser?: () => Promise<
    { data: { user: { id?: unknown } | null } | null; error: unknown }
  >;
  now?: number | (() => number);
  profiles?: unknown[];
  profileError?: unknown;
  orgActive?: boolean | null;
  memberships?: unknown[];
}

function setup(o: Opts = {}) {
  const writes: string[] = [];
  const meCalls: string[] = [];
  const secretsSelects: string[] = [];
  const meSignals: AbortSignal[] = [];
  const settings = {
    facturapi_mode: o.mode ?? "test",
    razon_social: "ELOGISTIX SHIPPING",
    rfc: "EKU9003173C9",
  };
  const tables: Record<string, DbResult> = {
    profiles: {
      data: o.profiles ?? [{ is_active: true }],
      error: o.profileError ?? null,
    },
    user_roles: { data: [{ role: o.role ?? "admin" }], error: null },
    organization_memberships: {
      data: o.memberships ??
        [{
          organization_id: o.org ?? TENANT_ORGANIZATION_ID,
          member_type: "internal",
        }],
      error: null,
    },
    organizations: {
      data: [{
        id: TENANT_ORGANIZATION_ID,
        is_active: "orgActive" in o ? o.orgActive : true,
      }],
      error: null,
    },
    company_settings: {
      data: Array.from({ length: o.settingsRows ?? 1 }, () => settings),
      error: null,
    },
  };
  let secretsReads = 0;
  const db: Db & { rpc: (n: string) => Promise<DbResult> } = {
    from(t: string) {
      if (t !== "billing_secrets") {
        return query(tables[t] ?? { data: null, error: null }, writes, t);
      }
      secretsReads++;
      const data = secretsReads % 2 === 1
        ? { facturapi_test_key: o.key === undefined ? TEST_KEY : o.key }
        : (o.otherOwner ? { organization_id: OTHER_ORG } : null);
      return query(
        { data, error: null },
        writes,
        t,
        (c) => secretsSelects.push(c),
      );
    },
    rpc: (
      n: string,
    ) => (writes.push(`rpc:${n}`),
      Promise.resolve({ data: null, error: null })),
  };
  const claims = o.claims === undefined
    ? { sub: USER_ID, role: "authenticated", session_id: SESSION_ID }
    : o.claims;
  const caller: CallerClientLike = {
    auth: {
      getClaims: () =>
        Promise.resolve({
          data: claims === null ? null : { claims },
          error: null,
        }),
      getUser: o.getUser ??
        (() =>
          Promise.resolve({ data: { user: { id: USER_ID } }, error: null })),
    },
  };
  const now = o.now ?? RUN_NOT_BEFORE + 60_000;
  const deps: RunnerDeps = {
    createCallerClient: () => caller,
    createServiceClient: () => db as unknown as SupabaseLike,
    env: () => undefined,
    now: typeof now === "function" ? now : () => now,
    createIssuerReader: (k) => ({
      me: (signal) => {
        meCalls.push(k === TEST_KEY ? "test-key" : "other-key");
        meSignals.push(signal);
        if (o.meFails) return Promise.reject(new Error("boom"));
        return Promise.resolve({
          legal: o.issuer ??
            { legal_name: "ELOGISTIX SHIPPING", tax_id: "EKU9003173C9" },
        });
      },
    }),
  };
  return { deps, writes, meCalls, secretsSelects, meSignals };
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
  assert(
    !text.includes("EKU9003173C9"),
    "la respuesta no debe contener el RFC",
  );
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
  assertEquals(
    (await run({ settingsRows: 2 })).json.error,
    "company_settings_ambiguous",
  );
  assertEquals(
    (await run({ settingsRows: 0 })).json.error,
    "company_settings_ambiguous",
  );
  assertEquals((await run({ key: null })).json.error, "key_not_test");
});

Deno.test("bloquea llave compartida con otra empresa (código del PR)", async () => {
  const { json, meCalls } = await run({ otherOwner: true });
  assertEquals(json.error, "config_duplicate_key");
  assertEquals(meCalls, []);
});

Deno.test("bloquea emisor discordante", async () => {
  const a = await run({
    issuer: { legal_name: "OTRA SA", tax_id: "EKU9003173C9" },
  });
  assertEquals([a.res.status, a.json.issuer_legal_name_matches], [409, false]);
  const b = await run({
    issuer: { legal_name: "ELOGISTIX SHIPPING", tax_id: "XAXX010101000" },
  });
  assertEquals([b.res.status, b.json.issuer_tax_id_matches], [409, false]);
  assertEquals(
    compareIssuer({
      providerLegalName: "",
      providerTaxId: "",
      erpRazonSocial: "",
      erpRfc: "",
    }).taxIdMatches,
    false,
  );
});

Deno.test("bloquea caller no autorizado", async () => {
  assertEquals((await run({}, ok, "")).res.status, 401);
  assertEquals((await run({ claims: null })).res.status, 401);
  assertEquals((await run({ role: "viewer" })).res.status, 403);
  assertEquals(
    (await run({
      claims: { sub: USER_ID, role: "service_role", session_id: SESSION_ID },
    })).json.error,
    "caller_role_not_allowed",
  );
});

Deno.test("sesión real: sin session_id, session_id inválido o getUser discordante => 401 sin leer secretos", async () => {
  const cases: Opts[] = [
    { claims: { sub: USER_ID, role: "authenticated" } },
    { claims: { sub: USER_ID, role: "authenticated", session_id: "no-uuid" } },
    {
      getUser: () =>
        Promise.resolve({ data: null, error: { message: "revoked" } }),
    },
    {
      getUser: () =>
        Promise.resolve({ data: { user: { id: OTHER_ORG } }, error: null }),
    },
    { getUser: () => Promise.resolve({ data: { user: null }, error: null }) },
    { getUser: () => Promise.reject(new Error("network")) },
  ];
  for (const c of cases) {
    const r = await run(c);
    assertEquals(r.res.status, 401, JSON.stringify(c.claims ?? "getUser"));
    assertEquals(r.secretsSelects, []);
    assertEquals(r.meCalls, []);
  }
  assertEquals((await run(cases[0])).json.error, "session_required");
  assertEquals((await run(cases[2])).json.error, "session_not_verified");
});

Deno.test("rechaza acciones, campos extra, run_id ajeno y fases no habilitadas", async () => {
  assertEquals(
    parseAction({
      action: "preflight",
      run_id: RUN_ID,
      organization_id: OTHER_ORG,
    }),
    null,
  );
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

Deno.test("caducidad revalidada justo antes de GET organizations/me", async () => {
  let calls = 0;
  // Dentro de la ventana en la entrada; vencida en la consulta previa al proveedor.
  const r = await run({
    now: () => (calls++ === 0 ? RUN_NOT_BEFORE + 1000 : RUN_EXPIRES_AT),
  });
  assertEquals([r.res.status, r.json.error], [410, "run_expired"]);
  assertEquals(r.meCalls, []);
});

Deno.test("límite del proveedor = menor entre 15 s y lo que resta de la ventana", () => {
  assertEquals(providerDeadlineMs(RUN_NOT_BEFORE + 1000), PROVIDER_TIMEOUT_MS);
  assertEquals(providerDeadlineMs(RUN_EXPIRES_AT - 4000), 4000);
  assertEquals(providerDeadlineMs(RUN_EXPIRES_AT), 0);
  assertEquals(providerDeadlineMs(RUN_NOT_BEFORE - 1), 0);
});

Deno.test("fallo del proveedor se detiene sin reintento; el signal llega sin abortar", async () => {
  const r = await run({ meFails: true });
  assertEquals([r.res.status, r.json.error], [502, "issuer_read_failed"]);
  assertEquals(r.meCalls.length, 1);
  const g = await run({});
  assertEquals(g.meSignals.length, 1);
  assertEquals(g.meSignals[0].aborted, false);
});

Deno.test("segunda solicitud simultánea en el mismo isolate se rechaza", async () => {
  __resetInFlightForTests();
  const s = setup({});
  let release: () => void = () => {};
  const gate = new Promise<void>((r) => (release = r));
  s.deps.createIssuerReader = () => ({
    me: async () => {
      await gate;
      return {
        legal: { legal_name: "ELOGISTIX SHIPPING", tax_id: "EKU9003173C9" },
      };
    },
  });
  const first = handleRunner(req(ok), s.deps);
  for (let i = 0; i < 20; i++) {
    await new Promise((r) => setTimeout(r, 0));
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
  await first;
  throw new Error("no se observó rechazo concurrente");
});

Deno.test("identidad estricta: perfil ausente/error/inactivo/null fallan cerrado", async () => {
  assertEquals((await run({ profiles: [] })).res.status, 403);
  assertEquals((await run({ profileError: { message: "x" } })).res.status, 503);
  assertEquals(
    (await run({ profiles: [{ is_active: false }] })).res.status,
    403,
  );
  const n = await run({ profiles: [{ is_active: null }] });
  assertEquals([n.res.status, n.json.error], [403, "profile_not_active"]);
  assertEquals(n.meCalls, []);
});

Deno.test("identidad estricta: sub vacío/no UUID, anon y cron se rechazan", async () => {
  assertEquals(
    (await run({
      claims: { sub: "", role: "authenticated", session_id: SESSION_ID },
    })).res.status,
    401,
  );
  assertEquals(
    (await run({
      claims: { sub: "user-1", role: "authenticated", session_id: SESSION_ID },
    })).res.status,
    401,
  );
  assertEquals(
    (await run({
      claims: { sub: USER_ID, role: "anon", session_id: SESSION_ID },
    })).json.error,
    "caller_role_not_allowed",
  );
});

Deno.test("membresía ambigua/ausente/ajena y empresa inactiva se rechazan", async () => {
  const two = [
    { organization_id: TENANT_ORGANIZATION_ID, member_type: "internal" },
    { organization_id: OTHER_ORG, member_type: "internal" },
  ];
  assertEquals((await run({ memberships: two })).res.status, 409);
  assertEquals((await run({ memberships: [] })).res.status, 403);
  assertEquals(
    (await run({ org: OTHER_ORG })).json.error,
    "tenant_not_allowed",
  );
  assertEquals((await run({ orgActive: false })).res.status, 403);
  assertEquals((await run({ orgActive: null })).res.status, 403);
});

Deno.test("modo live se rechaza ANTES de leer credenciales; la columna live nunca se pide", async () => {
  const live = await run({ mode: "live" });
  assertEquals([live.res.status, live.json.error], [409, "mode_not_test"]);
  assertEquals(live.secretsSelects, []);
  const good = await run({});
  assert(good.secretsSelects.length > 0);
  for (const c of good.secretsSelects) {
    assert(
      !c.includes("facturapi_live_key"),
      `select pidió columna live: ${c}`,
    );
  }
});

Deno.test("ventana corta: antes de NOT_BEFORE y al vencer responde 410; duración <= 6h", async () => {
  assertEquals((await run({ now: RUN_NOT_BEFORE - 1 })).res.status, 410);
  assertEquals((await run({ now: RUN_EXPIRES_AT })).res.status, 410);
  assert(RUN_EXPIRES_AT - RUN_NOT_BEFORE <= 6 * 3600_000);
});

Deno.test("errores no contienen la llave ni fragmentos", async () => {
  for (
    const o of [{ otherOwner: true }, { key: "sk_live_ABCDEF" }, {
      meFails: true,
    }] as Opts[]
  ) {
    const t = JSON.stringify((await run(o)).json);
    assert(!/sk_|ABCDEF|FAKE/.test(t), t);
  }
});
