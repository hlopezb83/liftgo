import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  buildPlan,
  executePlan,
  type HandlerDependencies,
  handleRequest,
} from "./handler.ts";
import { dateOnlyToMty } from "./periods.ts";
import {
  bookingFixture,
  invoiceFixture,
  planningFixture,
} from "./testFixtures.ts";

function request(body: unknown) {
  return new Request("http://localhost/generate-recurring-invoices", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function dependencies(
  mock: ReturnType<typeof planningFixture>,
  cron = false,
): HandlerDependencies {
  return {
    authenticateCronRequest: () =>
      Promise.resolve(
        cron
          ? { ok: true, via: "cron_secret" }
          : { ok: false, status: 401, error: "Unauthorized" },
      ),
    getAdminClient: () => mock.client,
    requireServiceOrRole: () =>
      Promise.resolve({
        ok: true,
        role: "admin",
        userId: "operator",
        email: null,
        adminClient: mock.client,
      }),
    planningDate: dateOnlyToMty("2026-07-21"),
  };
}

Deno.test("handler: cron generation is a no-op before any planning or write", async () => {
  const mock = planningFixture();
  const response = await handleRequest(
    request({ bookingIds: ["booking-1"], allowStaleRate: true }),
    dependencies(mock, true),
  );
  assertEquals(response.status, 200);
  assertEquals(
    (await response.json()).skipped,
    "automatic_generation_disabled",
  );
  assertEquals(mock.queries, []);
  assertEquals(mock.rpcCalls, []);
});

Deno.test("handler: cron preview remains read-only", async () => {
  const mock = planningFixture();
  const response = await handleRequest(
    request({ preview: true }),
    dependencies(mock, true),
  );
  assertEquals(response.status, 200);
  const body = await response.json();
  assertEquals(body.lines.length, 1);
  assertEquals(body.lines[0].eligible, true);
  assertEquals(mock.rpcCalls, []);
});

Deno.test("handler: server membership scopes manual preview, not payload tenant", async () => {
  const mock = planningFixture({
    bookings: [
      bookingFixture(),
      bookingFixture({ id: "foreign", organization_id: "org-B" }),
    ],
  });
  const response = await handleRequest(
    request({ preview: true, organizationId: "org-B" }),
    dependencies(mock),
  );
  assertEquals(response.status, 200);
  const body = await response.json();
  assertEquals(
    body.lines.map((line: { bookingId: string }) => line.bookingId),
    ["booking-1"],
  );
  assertEquals(mock.rpcCalls, []);
});

for (
  const selector of [{ selections: [], bookingIds: ["booking-1"] }, {
    bookingIds: [],
  }]
) {
  Deno.test(`handler: explicit empty selection never writes ${JSON.stringify(selector)}`, async () => {
    const mock = planningFixture();
    const response = await handleRequest(request(selector), dependencies(mock));
    assertEquals(response.status, 200);
    assertEquals((await response.json()).invoicesCreated, 0);
    assertEquals(mock.rpcCalls, []);
  });
}

Deno.test("handler: absent selector fails closed with 400", async () => {
  const mock = planningFixture();
  const response = await handleRequest(request({}), dependencies(mock));
  assertEquals(response.status, 400);
  assertEquals(mock.rpcCalls, []);
});

Deno.test("handler: explicit booking + period writes only selected catch-up item", async () => {
  const mock = planningFixture({
    bookings: [bookingFixture({ start_date: "2026-05-01" })],
  });
  const response = await handleRequest(
    request({
      selections: [{ bookingId: "booking-1", periodStart: "2026-06-01" }],
    }),
    dependencies(mock),
  );
  assertEquals(response.status, 200);
  assertEquals((await response.json()).invoicesCreated, 1);
  const writes = mock.rpcCalls.filter((call) =>
    call.fn === "create_recurring_invoice"
  );
  assertEquals(writes.length, 1);
  assertEquals(writes[0].args?.p_billing_period_start, "2026-06-01");
  assertEquals(writes[0].args?.p_billing_period_end, "2026-06-30");
});

Deno.test("executor: stale-rate periods need explicit operator opt-in", async () => {
  const mock = planningFixture({
    bookings: [
      bookingFixture({
        start_date: "2026-06-01",
        updated_at: "2026-07-15T00:00:00Z",
      }),
    ],
  });
  const plan = await buildPlan(
    mock.client,
    "org-A",
    dateOnlyToMty("2026-07-21"),
  );
  const result = await executePlan(mock.client, plan.items);
  assertEquals(result.skippedStaleRate, [{
    bookingIds: ["booking-1"],
    periodStart: "2026-06-01",
    periodEnd: "2026-06-30",
  }]);
  assertEquals(result.created.length, 1);
  const allowed = await executePlan(mock.client, [plan.items[0]], true);
  assertEquals(allowed.created.length, 1);
  assertEquals(allowed.rateWarnings.length, 1);
});

Deno.test("executor: RPC remains authority for concurrent idempotency and errors", async () => {
  const mock = planningFixture({ direct: [invoiceFixture()] });
  const plan = await buildPlan(
    mock.client,
    "org-A",
    dateOnlyToMty("2026-07-21"),
  );
  const originalRpc = mock.client.rpc;
  const args: unknown[] = [];
  mock.client.rpc = ((name: string, payload: unknown) => {
    if (name === "create_recurring_invoice") {
      args.push(payload);
      return Promise.resolve({
        data: { invoice_id: "concurrent-winner", already_existed: true },
        error: null,
      });
    }
    return originalRpc(name, payload as Record<string, unknown>);
  }) as unknown as typeof mock.client.rpc;
  const result = await executePlan(mock.client, plan.items);
  assertEquals(result.created, []);
  assertEquals(result.alreadyExisting.map((row) => row.invoiceId), [
    "concurrent-winner",
  ]);
  assertEquals(args.length, 1);
  mock.client.rpc =
    ((name: string, payload: unknown) =>
      name === "create_recurring_invoice"
        ? Promise.resolve({
          data: null,
          error: { message: "atomic guard rejected" },
        })
        : originalRpc(
          name,
          payload as Record<string, unknown>,
        )) as typeof mock.client.rpc;
  const rejected = await executePlan(mock.client, plan.items);
  assertEquals(rejected.created, []);
  assertEquals(rejected.failed[0].error, "atomic guard rejected");
  assertEquals(mock.inserts, []);
  assertEquals(mock.updates, []);
});

Deno.test("handler: authentication failure returns before reads or writes", async () => {
  const mock = planningFixture();
  const response = await handleRequest(request({ bookingIds: ["booking-1"] }), {
    ...dependencies(mock),
    requireServiceOrRole: () =>
      Promise.resolve({
        ok: false,
        response: new Response("Unauthorized", { status: 401 }),
      }),
  });
  assertEquals(response.status, 401);
  assertEquals(mock.queries, []);
  assertEquals(mock.rpcCalls, []);
});

Deno.test("executor: availability is rechecked after planning and fails closed if changed", async () => {
  const quoteId = "10700000-0000-4000-8000-000000000001";
  const mock = planningFixture({
    bookings: [
      bookingFixture({
        quote_id: quoteId,
        quotes: { organization_id: "org-A", line_items: [], rental_meta: [] },
      }),
    ],
  });
  let reads = 0;
  let writes = 0;
  mock.client.rpc = ((name: string) => {
    if (name === "get_quote_charge_availability") {
      reads++;
      return Promise.resolve(
        reads === 1
          ? {
            data: {
              complete: true,
              quotes: [{
                quote_id: quoteId,
                legacy_review_required: false,
                lines: [],
              }],
            },
            error: null,
          }
          : { data: null, error: { message: "availability changed" } },
      );
    }
    writes++;
    throw new Error("No write permitted after failed availability recheck");
  }) as unknown as typeof mock.client.rpc;
  const plan = await buildPlan(
    mock.client,
    "org-A",
    dateOnlyToMty("2026-07-21"),
  );
  assertEquals(plan.items.length, 1);
  const result = await executePlan(mock.client, plan.items);
  assertEquals(reads, 2);
  assertEquals(writes, 0);
  assertEquals(result.failed[0].error, "availability changed");
});
