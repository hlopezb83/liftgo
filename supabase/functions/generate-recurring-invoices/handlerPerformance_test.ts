import { deepStrictEqual as equal, match } from "node:assert/strict";
import {
  buildPlan,
  type HandlerDependencies,
  handleRequest,
} from "./handler.ts";
import {
  createRecurringPerformance,
  type RecurringPerformanceSnapshot,
} from "./performance.ts";
import { dateOnlyToMty } from "./periods.ts";
import { bookingFixture, planningFixture } from "./testFixtures.ts";

const date = dateOnlyToMty("2026-07-21");
function setup(options: Parameters<typeof planningFixture>[0] = {}) {
  const mock = planningFixture(options);
  const logs: RecurringPerformanceSnapshot[] = [];
  const dependencies: HandlerDependencies = {
    authenticateCronRequest: () =>
      Promise.resolve({ ok: false, status: 401, error: "Unauthorized" }),
    requireServiceOrRole: () =>
      Promise.resolve({
        ok: true,
        role: "admin",
        userId: "operator",
        email: null,
        adminClient: mock.client,
      }),
    getAdminClient: () => mock.client,
    planningDate: date,
    performance: createRecurringPerformance({
      emit: (entry) => logs.push(entry),
    }),
  };
  const request = (body: unknown, method = "POST") =>
    new Request("https://fixture.invalid/generate-recurring-invoices", {
      method,
      headers: {
        origin: "https://liftgo.lovable.app",
        "content-type": "application/json",
      },
      ...(method === "OPTIONS" ? {} : { body: JSON.stringify(body) }),
    });
  return { mock, logs, dependencies, request };
}

Deno.test("performance HTTP: tenant preview preserves body, exposes safe trace and aggregates", async () => {
  const input = {
    bookings: [
      bookingFixture(),
      bookingFixture({ id: "booking-other", organization_id: "org-B" }),
    ],
  };
  const fixture = setup(input);
  const baseline = await buildPlan(
    planningFixture(input).client,
    "org-A",
    date,
  );
  const response = await handleRequest(
    fixture.request({ preview: true }),
    fixture.dependencies,
  );
  equal(response.status, 200);
  equal(await response.json(), {
    success: true,
    period: "2026-07",
    lines: JSON.parse(JSON.stringify(baseline.lines)),
    truncated: baseline.truncated,
    pending_count: baseline.pendingCount,
  });
  const timing = response.headers.get("Server-Timing")!;
  for (
    const phase of [
      "auth_cron",
      "auth_user",
      "auth_org",
      "bookings",
      "fiscal",
      "history_linked",
      "history_direct",
      "plan",
      "serialize",
      "total",
    ]
  ) {
    match(timing, new RegExp(`(?:^|, )${phase};dur=\\d`));
  }
  equal(
    response.headers.get("Access-Control-Allow-Origin"),
    "https://liftgo.lovable.app",
  );
  equal(
    response.headers.get("Access-Control-Expose-Headers"),
    "Server-Timing, X-Recurring-Trace",
  );
  equal(fixture.logs.length, 1);
  equal(response.headers.get("X-Recurring-Trace"), fixture.logs[0].traceId);
  equal(fixture.logs[0].counts.bookings_rows, 1);
  equal(fixture.logs[0].counts.preview_lines, baseline.lines.length);
  equal(fixture.logs[0].counts.read_pages, 4);
  const serialized = JSON.stringify(fixture.logs);
  for (
    const privateValue of [
      "org-A",
      "org-B",
      "booking-other",
      "customer-1",
      "operator",
      "G03",
    ]
  ) equal(serialized.includes(privateValue), false);
  equal(fixture.mock.inserts, []);
  equal(fixture.mock.updates, []);
});

Deno.test("performance HTTP: failed tenant read emits no raw error or partial successful preview", async () => {
  const fixture = setup({ failTable: "invoices" });
  const response = await handleRequest(
    fixture.request({ preview: true }),
    fixture.dependencies,
  );
  equal(response.status, 500);
  equal(await response.json(), { error: "Internal server error" });
  equal(fixture.logs.length, 1);
  equal(fixture.logs[0].outcome, "error");
  equal(JSON.stringify(fixture.logs).includes("failed invoices"), false);
  equal(fixture.mock.inserts, []);
  equal(fixture.mock.updates, []);
});

Deno.test("performance HTTP: denied caller, invalid request and CORS do not emit diagnostics", async () => {
  for (const mode of ["denied", "invalid", "preflight"] as const) {
    const fixture = setup();
    if (mode === "denied") {
      fixture.dependencies.requireServiceOrRole = () =>
        Promise.resolve({
          ok: false,
          response: new Response("Forbidden", { status: 403 }),
        });
    }
    const response = await handleRequest(
      fixture.request(
        mode === "invalid" ? { preview: "yes" } : { preview: true },
        mode === "preflight" ? "OPTIONS" : "POST",
      ),
      fixture.dependencies,
    );
    equal(
      response.status,
      mode === "denied" ? 403 : mode === "invalid" ? 400 : 200,
    );
    equal(response.headers.get("Server-Timing"), null);
    equal(response.headers.get("X-Recurring-Trace"), null);
    equal(fixture.logs, []);
  }
});

Deno.test("performance HTTP: cron and service-wide previews never expose cross-tenant counts", async () => {
  for (const mode of ["cron", "service"] as const) {
    const fixture = setup();
    if (mode === "cron") {
      fixture.dependencies.authenticateCronRequest = () =>
        Promise.resolve({ ok: true, via: "cron_secret" });
    } else {fixture.dependencies.requireServiceOrRole = () =>
        Promise.resolve({
          ok: true,
          role: "service_role",
          userId: "",
          email: null,
          adminClient: fixture.mock.client,
        });}
    const response = await handleRequest(
      fixture.request({ preview: true }),
      fixture.dependencies,
    );
    equal(response.status, 200);
    equal(response.headers.get("Server-Timing"), null);
    equal(fixture.logs, []);
  }
});

Deno.test("performance HTTP: generation path never emits preview metrics", async () => {
  const fixture = setup();
  const response = await handleRequest(
    fixture.request({ selections: [] }),
    fixture.dependencies,
  );
  equal(response.status, 200);
  equal(response.headers.get("Server-Timing"), null);
  equal(fixture.logs, []);
});

Deno.test("performance HTTP: unavailable or inactive organization emits no diagnostics", async () => {
  for (const mode of ["unavailable", "inactive"] as const) {
    const fixture = setup(
      mode === "unavailable" ? { failTable: "organizations" } : {},
    );
    if (mode === "inactive") {
      const original = fixture.mock.client.from.bind(fixture.mock.client);
      fixture.mock.client.from = ((table: string) =>
        table === "organizations"
          ? {
            select: () => ({
              eq: () => ({
                limit: () =>
                  Promise.resolve({
                    data: [{ is_active: false }],
                    error: null,
                  }),
              }),
            }),
          }
          : original(table)) as typeof fixture.mock.client.from;
    }
    const response = await handleRequest(
      fixture.request({ preview: true }),
      fixture.dependencies,
    );
    equal(response.status, mode === "unavailable" ? 503 : 403);
    equal(response.headers.get("Server-Timing"), null);
    equal(fixture.logs, []);
    equal(
      fixture.mock.queries.some((query) => query.table === "bookings"),
      false,
    );
  }
});
