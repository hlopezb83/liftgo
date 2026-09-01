// R8-01 / R8-07 / R8-08 — pruebas del catch-up mensual bajo fallos y concurrencia.
import {
  assertEquals,
  assertStrictEquals,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  generateForPolicies,
  type MaintenanceClientLike,
  type MaintenancePolicyRow,
  pendingMonthsFor,
  type PostgrestErrorLike,
} from "./logic.ts";

function policy(
  over: Partial<MaintenancePolicyRow> = {},
): MaintenancePolicyRow {
  return {
    id: "p1",
    forklift_id: "f1",
    service_type: "preventivo",
    description: null,
    provider_name: "Proveedor",
    monthly_cost: 1000,
    last_generated_month: null,
    forklifts: { name: "MC-1", status: "rented" },
    ...over,
  };
}

interface Recorded {
  claims: string[];
  inserts: string[];
  rollbacks: { patch: Record<string, unknown>; filters: [string, unknown][] }[];
}

function makeClient(opts: {
  claim?: (month: string) => { data: boolean | null; error: PostgrestErrorLike | null };
  insert?: (month: string) => PostgrestErrorLike | null;
}): { client: MaintenanceClientLike; rec: Recorded } {
  const rec: Recorded = { claims: [], inserts: [], rollbacks: [] };
  const client: MaintenanceClientLike = {
    rpc(_fn, args) {
      const month = String(args.p_month);
      rec.claims.push(month);
      return Promise.resolve(
        opts.claim?.(month) ?? { data: true, error: null },
      );
    },
    from(_table) {
      return {
        insert(row) {
          const month = String(row.policy_month);
          rec.inserts.push(month);
          return Promise.resolve({ error: opts.insert?.(month) ?? null });
        },
        update(patch) {
          const filters: [string, unknown][] = [];
          const chain = {
            eq(column: string, value: unknown) {
              filters.push([column, value]);
              rec.rollbacks.push({ patch, filters });
              return chain as never;
            },
          };
          return chain as never;
        },
      };
    },
  };
  return { client, rec };
}

Deno.test("pendingMonthsFor: secuencia estricta y tope de 12 meses", () => {
  assertEquals(pendingMonthsFor("2025-11", "2026-02"), [
    "2025-12",
    "2026-01",
    "2026-02",
  ]);
  assertEquals(pendingMonthsFor(null, "2026-02"), ["2026-02"]);
  assertEquals(pendingMonthsFor("2026-02", "2026-02"), []);
  assertEquals(pendingMonthsFor("2000-01", "2026-02").length, 12);
});

Deno.test("R8-01: duplicado 23505 cuenta como mes ya generado y el catch-up sigue", async () => {
  // Corrida previa: m1/m2 ok, m3 falló de forma transitoria y se hizo rollback.
  // Esta corrida vuelve a topar con m1 duplicado y debe recuperarse hasta m3.
  const { client, rec } = makeClient({
    insert: (m) =>
      m === "2026-01" || m === "2026-02"
        ? { code: "23505", message: "duplicate key" }
        : null,
  });

  const res = await generateForPolicies(
    client,
    [policy({ last_generated_month: "2025-12" })],
    "2026-03",
  );

  assertEquals(rec.claims, ["2026-01", "2026-02", "2026-03"]);
  assertEquals(rec.inserts, ["2026-01", "2026-02", "2026-03"]);
  assertEquals(rec.rollbacks.length, 0);
  assertStrictEquals(res.generated, 1);
  assertStrictEquals(res.skipped, 2);
});

Deno.test("R8-07: el rollback es compare-and-set sobre el mes reclamado", async () => {
  const { client, rec } = makeClient({
    insert: (m) => (m === "2026-02" ? { code: "23514", message: "boom" } : null),
  });

  const res = await generateForPolicies(
    client,
    [policy({ last_generated_month: "2025-12" })],
    "2026-03",
  );

  // Corta el catch-up: no intenta 2026-03.
  assertEquals(rec.claims, ["2026-01", "2026-02"]);
  assertStrictEquals(res.generated, 1);
  assertStrictEquals(rec.rollbacks.length, 1);
  const rb = rec.rollbacks[0];
  assertEquals(rb.patch, { last_generated_month: "2026-01" });
  assertEquals(rb.filters, [
    ["id", "p1"],
    ["last_generated_month", "2026-02"],
  ]);
});

Deno.test("R8-08: un claim fallido corta el catch-up (no deja huecos)", async () => {
  const { client, rec } = makeClient({
    claim: (m) =>
      m === "2026-01"
        ? { data: null, error: { message: "deadlock detected" } }
        : { data: true, error: null },
  });

  const res = await generateForPolicies(
    client,
    [policy({ last_generated_month: "2025-12" })],
    "2026-03",
  );

  assertEquals(rec.claims, ["2026-01"]);
  assertEquals(rec.inserts, []);
  assertStrictEquals(res.generated, 0);
  assertStrictEquals(res.skipped, 0);
});

Deno.test("claim ya tomado por otra corrida → skipped, sin insert", async () => {
  const { client, rec } = makeClient({
    claim: (m) =>
      m === "2026-01"
        ? { data: false, error: null }
        : { data: true, error: null },
  });

  const res = await generateForPolicies(
    client,
    [policy({ last_generated_month: "2025-12" })],
    "2026-02",
  );

  assertEquals(rec.inserts, ["2026-02"]);
  assertStrictEquals(res.skipped, 1);
  assertStrictEquals(res.generated, 1);
});
