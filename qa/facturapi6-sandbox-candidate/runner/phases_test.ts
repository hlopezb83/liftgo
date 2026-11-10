// Pruebas sin red de las fases con efecto. Los handlers reales NO se ejecutan
// aquí con red: las pruebas verifican compuertas, claims una-sola-vez,
// cierre irreversible y ausencia de reintentos usando PHASES intercambiadas.
import { assert, assertEquals } from "@std/assert";
import { claimObject, DISABLED_OBJECT, MemoryClaimStore, StorageClaimStore } from "./claims.ts";
import { guardedFetch, PHASES, runWritePhase, TOTAL_PLANNED_DOCUMENTS, validateFixtures, type WritePhaseDeps } from "./phases.ts";
import { restrictSecretsView } from "./guards.ts";
import {
  DURABLE_CLAIMS_GUARANTEED,
  MAX_DOCUMENTS_PER_RUN,
  RUN_EXPIRES_AT,
  RUN_ID,
  RUN_NOT_BEFORE,
  TENANT_ORGANIZATION_ID,
  WRITE_PHASES_ENABLED,
} from "./policy.ts";

const fixtures = {
  run_id: RUN_ID,
  organization_id: TENANT_ORGANIZATION_ID,
  invoice_id: "22222222-2222-4222-8222-222222222222",
  payment_id: "33333333-3333-4333-8333-333333333333",
  credit_note_id: "44444444-4444-4444-8444-444444444444",
  invoice_total_mxn: 116,
  payment_amount_mxn: 116,
  credit_note_total_mxn: 10,
  max_line_quantity: 1,
};

function deps(over: Partial<WritePhaseDeps> = {}, handler?: (r: Request) => Promise<Response>) {
  const calls: string[] = [];
  const claims = new MemoryClaimStore();
  const orig = PHASES.stamp_invoice.call!;
  if (handler) {
    (PHASES as any).stamp_invoice.call = (f: any, c: any) => ({
      ...orig(f, c),
      run: async (r: Request) => {
        calls.push(await r.text());
        return handler(r);
      },
    });
  }
  const d: WritePhaseDeps = {
    now: () => RUN_NOT_BEFORE + 1000,
    claims,
    loadFixtures: async () => fixtures,
    ctx: { serviceClient: () => ({}) as never, callerClient: () => ({}) as never, env: () => undefined, fetchImpl: fetch },
    gates: { writeEnabled: true, claimsGuaranteed: true },
    ...over,
  };
  return { d, calls, claims, restore: () => ((PHASES as any).stamp_invoice.call = orig) };
}

Deno.test("por defecto las fases de escritura están cerradas", async () => {
  assertEquals([WRITE_PHASES_ENABLED, DURABLE_CLAIMS_GUARANTEED], [false, false]);
  const { d } = deps({ gates: undefined });
  assertEquals((await runWritePhase("stamp_invoice", "Bearer x", d)).body.error, "phase_not_enabled");
  const e = deps({ gates: { writeEnabled: true, claimsGuaranteed: false } });
  assertEquals((await runWritePhase("stamp_invoice", "Bearer x", e.d)).body.error, "durable_claim_unverified");
});

Deno.test("plan respeta tope de documentos y retrieve/updateStatus queda bloqueado por cierre", async () => {
  assert(TOTAL_PLANNED_DOCUMENTS <= MAX_DOCUMENTS_PER_RUN);
  const { d } = deps();
  assertEquals((await runWritePhase("retrieve_and_update_status", "Bearer x", d)).body.error, "handler_not_in_reviewed_closure");
});

Deno.test("fixtures inválidas o ajenas no reservan ni ejecutan", async () => {
  assertEquals(validateFixtures({ ...fixtures, organization_id: "x" }), false);
  assertEquals(validateFixtures({ ...fixtures, invoice_total_mxn: 116.01 }), false);
  assertEquals(validateFixtures({ ...fixtures, max_line_quantity: 2 }), false);
  assertEquals(validateFixtures({ ...fixtures, run_id: "otro" }), false);
  const s = deps({ loadFixtures: async () => null }, () => Promise.resolve(new Response("{}")));
  try {
    assertEquals((await runWritePhase("stamp_invoice", "Bearer x", s.d)).body.error, "fixtures_missing_or_invalid");
    assertEquals([s.calls.length, s.claims.objects.size], [0, 0]);
  } finally { s.restore(); }
});

Deno.test("cada acción se ejecuta una sola vez; segunda vez 409 sin llamar al handler", async () => {
  const s = deps({}, () => Promise.resolve(new Response("{}", { status: 200 })));
  try {
    assertEquals((await runWritePhase("stamp_invoice", "Bearer x", s.d)).status, 200);
    assertEquals((await runWritePhase("stamp_invoice", "Bearer x", s.d)).body.error, "action_already_claimed");
    assertEquals(s.calls.length, 1);
    assertEquals(JSON.parse(s.calls[0]), { invoice_id: fixtures.invoice_id });
  } finally { s.restore(); }
});

Deno.test("timeout/excepción/5xx del handler: cierre irreversible y sin reintento", async () => {
  for (const h of [() => Promise.reject(new Error("timeout")), () => Promise.resolve(new Response("{}", { status: 504 }))]) {
    const s = deps({}, h);
    try {
      const r = await runWritePhase("stamp_invoice", "Bearer x", s.d);
      assertEquals(r.status, 409);
      assert(s.claims.objects.has(DISABLED_OBJECT));
      assertEquals(s.calls.length, 1);
      assertEquals((await runWritePhase("payment_and_rep", "Bearer x", s.d)).body.error, "run_disabled");
    } finally { s.restore(); }
  }
});

Deno.test("estado no verificable o claim incierto: falla cerrado sin efecto", async () => {
  const a = deps({}, () => Promise.resolve(new Response("{}")));
  a.claims.failNext = "state";
  try {
    assertEquals((await runWritePhase("stamp_invoice", "Bearer x", a.d)).body.error, "run_state_unverifiable");
    assertEquals(a.calls.length, 0);
  } finally { a.restore(); }
  const b = deps({}, () => Promise.resolve(new Response("{}")));
  b.claims.failNext = "reserve";
  try {
    assertEquals((await runWritePhase("stamp_invoice", "Bearer x", b.d)).body.error, "claim_uncertain_run_disabled");
    assertEquals(b.calls.length, 0);
    assert(b.claims.objects.has(DISABLED_OBJECT));
  } finally { b.restore(); }
});

Deno.test("caducidad se revalida justo antes del efecto", async () => {
  let t = RUN_NOT_BEFORE + 1000;
  const s = deps({ now: () => t }, () => Promise.resolve(new Response("{}")));
  const origReserve = s.claims.reserve.bind(s.claims);
  s.claims.reserve = async (a, p) => { const r = await origReserve(a, p); t = RUN_EXPIRES_AT; return r; };
  try {
    assertEquals((await runWritePhase("stamp_invoice", "Bearer x", s.d)).status, 410);
    assertEquals(s.calls.length, 0);
    assert(s.claims.objects.has(claimObject("stamp_invoice")));
  } finally { s.restore(); }
});

Deno.test("StorageClaimStore: upsert:false, 409 = ya reclamado, errores = incierto", async () => {
  const seen: unknown[] = [];
  const store = new StorageClaimStore({
    upload: (path, _b, opts) => { seen.push([path, opts.upsert]); return Promise.resolve({ error: seen.length > 1 ? { statusCode: "409", message: "The resource already exists" } : null }); },
    download: () => Promise.resolve({ data: null, error: { statusCode: "404", message: "Object not found" } }),
  }, () => 0);
  assertEquals(await store.state(), "open");
  assertEquals(await store.reserve("stamp_invoice", {}), "reserved");
  assertEquals(await store.reserve("stamp_invoice", {}), "already_claimed");
  assertEquals(seen, [[claimObject("stamp_invoice"), false], [claimObject("stamp_invoice"), false]]);
  const bad = new StorageClaimStore({
    upload: () => Promise.resolve({ error: { statusCode: "500", message: "boom" } }),
    download: () => Promise.resolve({ data: null, error: { statusCode: "500", message: "boom" } }),
  }, () => 0);
  let threw = 0;
  await bad.state().catch(() => threw++);
  await bad.reserve("x", {}).catch(() => threw++);
  assertEquals(threw, 2);
  assert(!claimObject("x").startsWith(TENANT_ORGANIZATION_ID), "prefijo sin organización: fuera del alcance RLS de usuarios");
});

Deno.test("fetch del handler sólo permite Facturapi y el propio backend", async () => {
  const f = guardedFetch(() => Promise.resolve(new Response("ok")), "https://backend.example");
  assertEquals((await f("https://www.facturapi.io/v2/invoices")).status, 200);
  assertEquals((await f("https://backend.example/rest/v1/x")).status, 200);
  let blocked = 0;
  await f("https://evil.example/x").catch(() => blocked++);
  await f("http://www.facturapi.io/v2").catch(() => blocked++);
  assertEquals(blocked, 2);
});

Deno.test("vista de secretos: reescribe select y bloquea filtros por columna live", () => {
  const cols: string[] = [];
  const builder: any = { select: (c: string) => { cols.push(c); return builder; }, eq: () => builder };
  const v: any = restrictSecretsView({ from: () => builder });
  v.from("billing_secrets").select("facturapi_test_key, facturapi_live_key").eq("organization_id", "x");
  assertEquals(cols, ["facturapi_test_key"]);
  let threw = false;
  try { v.from("billing_secrets").select("organization_id").eq("facturapi_live_key", "k"); } catch { threw = true; }
  assert(threw);
});
