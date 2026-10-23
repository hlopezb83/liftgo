// Fase 1 multiempresa: aislamiento por organización en el generador de
// facturas recurrentes.
//  - Dos empresas con el mismo cliente y el mismo período NO deben agruparse
//    en una sola factura (la clave de agrupación de executePlan incluye
//    organizationId).
//  - El camino manual (usuario autenticado) siempre resuelve la organización
//    en el servidor (resolveCallerOrganization) y NUNCA acepta una
//    organización arbitraria del payload/cron.
import {
  assertEquals,
  assertNotEquals,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import { buildSupabaseMock } from "../_shared/test/supabaseClientMock.ts";
import { resolveCallerOrganization } from "../_shared/orgContext.ts";

import { groupPlanItems } from "./grouping.ts";
import { buildPlan, executePlan } from "./handler.ts";
import { dateOnlyToMty } from "./periods.ts";
import { bookingFixture, planningFixture } from "./testFixtures.ts";

const shared = {
  organizationId: "org-A",
  customerId: "cust-1",
  startStr: "2026-01-01",
  endStr: "2026-01-31",
  currency: "MXN",
  tipoCambio: 1,
};

for (
  const [dimension, different] of Object.entries({
    organizationId: "org-B",
    customerId: "cust-2",
    startStr: "2026-01-02",
    endStr: "2026-01-30",
    currency: "USD",
    tipoCambio: 19,
  })
) {
  Deno.test(`actual invoice grouping keeps ${dimension} separate`, () => {
    const groups = groupPlanItems([shared, {
      ...shared,
      [dimension]: different,
    }]);
    assertEquals(groups.size, 2);
    assertEquals([...groups.values()].map((group) => group.length), [1, 1]);
  });
}

Deno.test("actual grouping combines only the same tenant/customer/period/currency/rate", () => {
  const groups = groupPlanItems([shared, { ...shared }]);
  assertEquals(groups.size, 1);
  assertEquals([...groups.values()][0].length, 2);
});

Deno.test("executePlan uses real grouping and scoped customer lookup for atomic RPCs", async () => {
  const bookings = [
    bookingFixture({ id: "a-mxn-1" }),
    bookingFixture({ id: "a-mxn-2" }),
    bookingFixture({ id: "b-mxn", organization_id: "org-B" }),
    bookingFixture({ id: "a-usd-18", currency: "USD", tipo_cambio: 18 }),
    bookingFixture({ id: "a-usd-19", currency: "USD", tipo_cambio: 19 }),
  ];
  const mock = planningFixture({ bookings });
  const plan = await buildPlan(mock.client, null, dateOnlyToMty("2026-07-21"));
  assertEquals(plan.lines.map((line) => line.taxRate), [16, 16, 8, 16, 16]);
  const result = await executePlan(mock.client, plan.items);
  assertEquals(result.failed, []);
  assertEquals(result.created.map((row) => row.bookingIds), [
    ["a-mxn-1", "a-mxn-2"],
    ["b-mxn"],
    ["a-usd-18"],
    ["a-usd-19"],
  ]);
  assertEquals(
    mock.rpcCalls.map((call) => call.fn),
    Array.from(
      { length: 4 },
      () => ["get_quote_charge_availability", "create_recurring_invoice"],
    ).flat(),
  );
  const writes = mock.rpcCalls.filter((call) =>
    call.fn === "create_recurring_invoice"
  );
  assertEquals(
    writes.map((
      call,
    ) => [
      call.args?.p_moneda,
      call.args?.p_tipo_cambio,
      call.args?.p_booking_ids,
    ]),
    [
      ["MXN", 1, ["a-mxn-1", "a-mxn-2"]],
      ["MXN", 1, ["b-mxn"]],
      ["USD", 18, ["a-usd-18"]],
      ["USD", 19, ["a-usd-19"]],
    ],
  );
  assertEquals(writes[0].args?.p_total, 7192);
  assertEquals(writes[1].args?.p_tax_rate, 8);
  assertEquals(writes[1].args?.p_total, 3348);
  const customerLookups = mock.queries.filter((query) =>
    query.table === "organization_customers" &&
    query.filters.some((filter) => filter.col === "organization_id")
  );
  assertEquals(
    customerLookups.map((query) =>
      query.filters.find((filter) => filter.col === "organization_id")?.val
    ),
    ["org-A", "org-B", "org-A", "org-A"],
  );
  assertEquals(mock.inserts, []);
  assertEquals(mock.updates, []);
});

Deno.test("manual planner scopes bookings and rejects invalid FX without executing RPC", async () => {
  const mock = planningFixture({
    bookings: [
      bookingFixture(),
      bookingFixture({ id: "other-tenant", organization_id: "org-B" }),
      bookingFixture({ id: "invalid-fx", currency: "USD", tipo_cambio: 1 }),
    ],
  });
  const result = await buildPlan(
    mock.client,
    "org-A",
    dateOnlyToMty("2026-07-21"),
  );
  assertEquals(result.items.map((item) => item.bookingId), ["booking-1"]);
  assertEquals(result.lines.map((line) => [line.bookingId, line.reason]), [[
    "booking-1",
    undefined,
  ], ["invalid-fx", "no_exchange_rate"]]);
  assertEquals(mock.rpcCalls, []);
});

Deno.test("multiempresa: resolveCallerOrganization deriva la organización de la membresía, no del payload", async () => {
  const mock = buildSupabaseMock({
    selects: {
      organizations: {
        data: [{ id: "org-server-side", is_active: true }],
        error: null,
      },
      organization_memberships: {
        data: [{ organization_id: "org-server-side", member_type: "internal" }],
        error: null,
      },
    },
  });

  // Aunque un payload intentara enviar `organizationId: "org-attacker"`, el
  // camino manual sólo usa lo devuelto por resolveCallerOrganization, que
  // ignora completamente el body de la petición.
  const result = await resolveCallerOrganization(mock.client, "user-1");
  assertEquals(result.ok, true);
  if (result.ok) {
    assertEquals(result.organizationId, "org-server-side");
    assertNotEquals(result.organizationId, "org-attacker");
  }
});

Deno.test("multiempresa: sin membresía interna, resolveCallerOrganization falla cerrado (fail-closed)", async () => {
  const mock = buildSupabaseMock({
    selects: {
      organization_memberships: { data: [], error: null },
    },
  });
  const result = await resolveCallerOrganization(mock.client, "user-2");
  assertEquals(result.ok, false);
});
