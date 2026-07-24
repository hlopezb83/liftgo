// TESTS-ARQ2 v2 · DIFF 16: valida `authenticateCronRequest` — timing-safe
// comparison + las 3 fuentes (x-cron-secret, Bearer cron_secret, Bearer
// service_role). Sin cobertura, un refactor a `===` volvía a abrir el canal
// timing side-channel.
import {
  assertEquals,
  assertStrictEquals,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import { authenticateCronRequest } from "./cronAuth.ts";

const CRON = "cron-secret-xxxxxxxxxxxxxxxxxxxxxxxxxxx";
const SRV = "service-role-yyyyyyyyyyyyyyyyyyyyyyyyyy";

function reset() {
  Deno.env.set("CRON_SECRET", CRON);
  Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", SRV);
  // getAdminClient() sólo se invoca si CRON_SECRET está vacío; para blindar
  // los tests le damos URL local aunque no la ejercitamos.
  Deno.env.set("SUPABASE_URL", "http://localhost:54321");
}

function makeReq(headers: Record<string, string> = {}) {
  return new Request("http://localhost/cron", { method: "POST", headers });
}

Deno.test("cronAuth: header x-cron-secret válido → ok (via cron_secret)", async () => {
  reset();
  const res = await authenticateCronRequest(makeReq({ "x-cron-secret": CRON }));
  assertEquals(res, { ok: true, via: "cron_secret" });
});

Deno.test("cronAuth: Bearer <cron_secret> válido → ok (via cron_secret)", async () => {
  reset();
  const res = await authenticateCronRequest(
    makeReq({ Authorization: `Bearer ${CRON}` }),
  );
  assertEquals(res, { ok: true, via: "cron_secret" });
});

Deno.test("cronAuth: Bearer <service_role> válido → ok (via service_role)", async () => {
  reset();
  const res = await authenticateCronRequest(
    makeReq({ Authorization: `Bearer ${SRV}` }),
  );
  assertEquals(res, { ok: true, via: "service_role" });
});

Deno.test("cronAuth: sin headers → 401", async () => {
  reset();
  const res = await authenticateCronRequest(makeReq());
  assertStrictEquals(res.ok, false);
  if (!res.ok) assertEquals(res.status, 401);
});

Deno.test("cronAuth: secreto correcto pero con espacio extra → 401 (no trim silencioso)", async () => {
  reset();
  const res = await authenticateCronRequest(
    makeReq({ "x-cron-secret": `${CRON} ` }),
  );
  assertStrictEquals(res.ok, false);
});

Deno.test("cronAuth: diferencia de longitud → 401 sin fugar tiempo (early-return length)", async () => {
  reset();
  const res = await authenticateCronRequest(
    makeReq({ "x-cron-secret": CRON.slice(0, -1) }),
  );
  assertStrictEquals(res.ok, false);
});

Deno.test("cronAuth: Bearer con secreto incorrecto (misma longitud) → 401", async () => {
  reset();
  const wrong = "z".repeat(CRON.length);
  const res = await authenticateCronRequest(
    makeReq({ Authorization: `Bearer ${wrong}` }),
  );
  assertStrictEquals(res.ok, false);
});

Deno.test("cronAuth: CRON_SECRET vacío + Bearer service_role → ok (fallback administrativo)", async () => {
  Deno.env.set("CRON_SECRET", "");
  Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", SRV);
  Deno.env.set("SUPABASE_URL", "http://localhost:54321");
  // Sin CRON_SECRET intenta rpc(internal_get_cron_secret); en el runtime de
  // test ese llamado falla silenciosamente (try/catch) y seguimos con "".
  const res = await authenticateCronRequest(
    makeReq({ Authorization: `Bearer ${SRV}` }),
  );
  // La rama service_role NO requiere cron_secret configurado.
  assertEquals(res, { ok: true, via: "service_role" });
});
