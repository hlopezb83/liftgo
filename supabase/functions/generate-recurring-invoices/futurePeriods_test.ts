import {
  assertEquals,
  assertThrows,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  buildPlan,
  type HandlerDependencies,
  handleRequest,
} from "./handler.ts";
import { futurePeriodLimit } from "./futurePeriods.ts";
import { dateOnlyToMty, toIsoDate } from "./periods.ts";
import {
  bookingFixture,
  invoiceFixture,
  planningFixture,
} from "./testFixtures.ts";

const today = dateOnlyToMty("2026-11-04");
const options = { includeFuturePeriods: true, futureThroughMonth: "2027-01" };
const selection = [{ bookingId: "booking-1", periodStart: "2027-01-01" }];
function request(body: unknown) {
  return new Request("http://localhost", {
    method: "POST",
    body: JSON.stringify(body),
  });
}
function deps(
  mock: ReturnType<typeof planningFixture>,
  role = "admin",
  cron = false,
): HandlerDependencies {
  return {
    planningDate: today,
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
        role,
        userId: "operator",
        email: null,
        adminClient: mock.client,
      }),
  };
}
function mockBooking(overrides: Record<string, unknown> = {}) {
  return bookingFixture({ start_date: "2026-11-01", ...overrides });
}

Deno.test("future: explicit opt-in adds future months; default stops at today", async () => {
  const mock = planningFixture({ bookings: [mockBooking()] });
  const ordinary = await buildPlan(mock.client, "org-A", today);
  assertEquals(ordinary.lines.map((line) => line.periodStart), ["2026-11-01"]);
  const future = await buildPlan(mock.client, "org-A", today, options);
  assertEquals(future.lines.map((line) => [line.periodStart, line.isFuture]), [
    ["2026-11-01", false],
    ["2026-12-01", true],
    ["2027-01-01", true],
  ]);
});

Deno.test("future: January advance cannot hide December hole or November", async () => {
  const mock = planningFixture({
    bookings: [mockBooking({ last_billed_date: "2027-01-31" })],
    direct: [
      invoiceFixture({
        billing_period_start: "2027-01-01",
        billing_period_end: "2027-01-31",
      }),
    ],
  });
  const plan = await buildPlan(mock.client, "org-A", today, options);
  assertEquals(plan.items.map((item) => item.startStr), [
    "2026-11-01",
    "2026-12-01",
  ]);
  assertEquals(plan.lines.every((line) => line.eligible), true);
});

for (const status of ["draft", "stamping", "pending", "rejected", "accepted"]) {
  Deno.test(`coverage: ${status} cancellation lifecycle`, async () => {
    const fiscal = ["pending", "rejected", "accepted"].includes(status);
    const mock = planningFixture({
      bookings: [mockBooking()],
      direct: [invoiceFixture({
        billing_period_start: "2026-11-01",
        billing_period_end: "2026-11-30",
        status: fiscal ? "cancelled" : "draft",
        cfdi_status: fiscal
          ? "stamped"
          : status === "stamping"
          ? "stamping"
          : null,
        cfdi_uuid: fiscal ? "uuid" : null,
        cancellation_status: fiscal ? status : null,
      })],
    });
    assertEquals(
      (await buildPlan(mock.client, "org-A", today)).items.length,
      status === "accepted" ? 1 : 0,
    );
  });
}

Deno.test("coverage: partial overlap blocks month, legacy without dates blocks booking", async () => {
  for (
    const [start, end, reason] of [[
      "2026-11-02",
      "2026-11-19",
      "period_overlap_review",
    ], [null, null, "legacy_period_review"]] as const
  ) {
    const mock = planningFixture({
      bookings: [mockBooking()],
      direct: [
        invoiceFixture({
          billing_period_start: start,
          billing_period_end: end,
        }),
      ],
    });
    const plan = await buildPlan(mock.client, "org-A", today);
    assertEquals(plan.items, []);
    assertEquals(plan.lines[0].reason, reason);
  }
});

Deno.test("future: first and final partial cycles never exceed contract", async () => {
  const mock = planningFixture({
    bookings: [
      mockBooking({ start_date: "2026-12-15", end_date: "2027-01-10" }),
    ],
  });
  const plan = await buildPlan(mock.client, "org-A", today, options);
  assertEquals(
    plan.items.map((
      item,
    ) => [item.startStr, item.endStr, item.proratedDays, item.billedAmount]),
    [
      ["2026-12-15", "2026-12-31", 17, 1700],
      ["2027-01-01", "2027-01-10", 10, 1000],
    ],
  );
});

Deno.test("future: technical horizon validated without coercion", () => {
  assertEquals(
    toIsoDate(
      futurePeriodLimit({
        includeFuturePeriods: true,
        futureThroughMonth: "2028-11",
      }, today),
    ),
    "2028-11-30",
  );
  for (
    const body of [
      { includeFuturePeriods: true },
      { includeFuturePeriods: true, futureThroughMonth: "2028-12" },
      { includeFuturePeriods: true, futureThroughMonth: "2026-10" },
      { includeFuturePeriods: true, futureThroughMonth: "2026-13" },
      { futureThroughMonth: "2026-12" },
      { includeFuturePeriods: "true" },
    ]
  ) {
    assertThrows(() => futurePeriodLimit(body as typeof options, today));
  }
});

Deno.test("future: preview and generation require authenticated operator, not service or cron", async () => {
  for (const cron of [false, true]) {
    for (const preview of [false, true]) {
      const mock = planningFixture({ bookings: [mockBooking()] });
      const response = await handleRequest(
        request({ ...options, preview, selections: selection }),
        deps(mock, "service_role", cron),
      );
      assertEquals(response.status, 403);
      assertEquals(mock.rpcCalls, []);
    }
  }
});

Deno.test("future: generation requires exact selection; no bookingIds fallback", async () => {
  for (
    const body of [{ ...options }, { ...options, bookingIds: ["booking-1"] }, {
      ...options,
      selections: [],
      bookingIds: ["booking-1"],
    }]
  ) {
    const mock = planningFixture({ bookings: [mockBooking()] });
    assertEquals((await handleRequest(request(body), deps(mock))).status, 400);
    assertEquals(mock.rpcCalls, []);
  }
  const mock = planningFixture({ bookings: [mockBooking()] });
  const result = await handleRequest(
    request({ ...options, selections: [] }),
    deps(mock),
  );
  assertEquals((await result.json()).invoicesCreated, 0);
  assertEquals(mock.rpcCalls, []);
});

Deno.test("future: first unpaid period creates only January and persists its exact bounds", async () => {
  const mock = planningFixture({
    bookings: [mockBooking()],
    direct: [
      invoiceFixture({
        billing_period_start: "2026-11-01",
        billing_period_end: "2026-12-31",
      }),
    ],
  });
  const preview = await buildPlan(mock.client, "org-A", today, options);
  const expectedFingerprint =
    preview.lines.find((line) => line.periodStart === "2027-01-01")!
      .previewFingerprint;
  const result = await handleRequest(
    request({
      ...options,
      selections: [{ ...selection[0], expectedFingerprint }],
    }),
    deps(mock),
  );
  assertEquals((await result.json()).invoicesCreated, 1);
  const writes = mock.rpcCalls.filter((call) =>
    call.fn === "create_recurring_invoice"
  );
  assertEquals(writes.length, 1);
  assertEquals(writes[0].args?.p_billing_period_start, "2027-01-01");
  assertEquals(writes[0].args?.p_billing_period_end, "2027-01-31");
});

Deno.test("future: no opt-in cannot write future selector", async () => {
  const mock = planningFixture({ bookings: [mockBooking()] });
  const result = await handleRequest(
    request({ selections: selection }),
    deps(mock),
  );
  assertEquals((await result.json()).invoicesCreated, 0);
  assertEquals(mock.rpcCalls, []);
});

Deno.test("future: foreign organization and stale selections fail before writes", async () => {
  for (const foreign of [false, true]) {
    const mock = planningFixture({
      bookings: [mockBooking({ organization_id: foreign ? "org-B" : "org-A" })],
      direct: foreign ? [] : [
        invoiceFixture({
          billing_period_start: "2027-01-01",
          billing_period_end: "2027-01-31",
        }),
      ],
    });
    const result = await handleRequest(
      request({ ...options, selections: selection }),
      deps(mock),
    );
    assertEquals(result.status, 409);
    assertEquals(mock.rpcCalls, []);
  }
});

Deno.test("handler: malformed payload and exact selectors fail closed", async () => {
  for (
    const body of [
      null,
      [],
      "text",
      { preview: "true" },
      { selections: [{}] },
      { selections: [{ bookingId: "booking-1", periodStart: "2027-02-30" }] },
      { selections: "all", bookingIds: ["booking-1"] },
      { includeFuturePeriods: "false" },
    ]
  ) {
    const mock = planningFixture();
    assertEquals((await handleRequest(request(body), deps(mock))).status, 400);
    assertEquals(mock.rpcCalls, []);
  }
  const mock = planningFixture();
  assertEquals(
    (await handleRequest(
      new Request("http://localhost", { method: "POST", body: "{" }),
      deps(mock),
    )).status,
    400,
  );
  assertEquals(mock.rpcCalls, []);
});

Deno.test("future: fingerprint rejects changed rate, currency, customer and contract end", async () => {
  for (
    const changed of [
      { monthly_rate: 6200 },
      { currency: "USD", tipo_cambio: 20 },
      { customer_name: "Changed receiver" },
      { end_date: "2027-01-20" },
    ]
  ) {
    const booking = mockBooking();
    const mock = planningFixture({ bookings: [booking] });
    const preview = await buildPlan(mock.client, "org-A", today, options);
    const expectedFingerprint = preview.lines.find((line) =>
      line.periodStart === "2027-01-01"
    )!.previewFingerprint;
    const again = await buildPlan(mock.client, "org-A", today, options);
    assertEquals(
      again.lines.find((line) => line.periodStart === "2027-01-01")!
        .previewFingerprint,
      expectedFingerprint,
    );
    Object.assign(booking, changed);
    const response = await handleRequest(
      request({
        ...options,
        selections: [{ ...selection[0], expectedFingerprint }],
      }),
      deps(mock),
    );
    assertEquals(response.status, 409);
    assertEquals(
      mock.rpcCalls.filter((call) => call.fn === "create_recurring_invoice"),
      [],
    );
  }
});

Deno.test("future: missing fingerprint cannot authorize an anticipatory write", async () => {
  const mock = planningFixture({ bookings: [mockBooking()] });
  assertEquals(
    (await handleRequest(
      request({ ...options, selections: selection }),
      deps(mock),
    )).status,
    409,
  );
  assertEquals(mock.rpcCalls, []);
});

Deno.test("coverage: accepted December cancellation restores hole despite January advance", async () => {
  const mock = planningFixture({
    bookings: [
      mockBooking({ start_date: "2026-12-01", last_billed_date: "2027-01-31" }),
    ],
    direct: [
      invoiceFixture({
        id: "dec",
        billing_period_start: "2026-12-01",
        billing_period_end: "2026-12-31",
        status: "cancelled",
        cfdi_status: "stamped",
        cfdi_uuid: "uuid",
        cancellation_status: "accepted",
      }),
      invoiceFixture({
        id: "jan",
        billing_period_start: "2027-01-01",
        billing_period_end: "2027-01-31",
      }),
    ],
  });
  assertEquals(
    (await buildPlan(mock.client, "org-A", today, options)).items.map((item) =>
      item.startStr
    ),
    ["2026-12-01"],
  );
});

Deno.test("coverage: previously covered years do not consume 24-period output budget", async () => {
  const mock = planningFixture({
    bookings: [mockBooking({ start_date: "2020-01-01" })],
    direct: [
      invoiceFixture({
        billing_period_start: "2020-01-01",
        billing_period_end: "2026-10-31",
      }),
    ],
  });
  const plan = await buildPlan(mock.client, "org-A", today);
  assertEquals(plan.items.map((item) => item.startStr), ["2026-11-01"]);
  assertEquals(plan.truncated, false);
});

Deno.test("future: repeated concurrent submits respect atomic RPC winner (mock boundary)", async () => {
  const mock = planningFixture({
    bookings: [mockBooking()],
    direct: [
      invoiceFixture({
        billing_period_start: "2026-11-01",
        billing_period_end: "2026-12-31",
      }),
    ],
  });
  const preview = await buildPlan(mock.client, "org-A", today, options);
  const expectedFingerprint =
    preview.lines.find((line) => line.periodStart === "2027-01-01")!
      .previewFingerprint;
  const originalRpc = mock.client.rpc;
  let created = false;
  mock.client.rpc = ((name: string, args: unknown) => {
    if (name !== "create_recurring_invoice") {
      return originalRpc(name, args as Record<string, unknown>);
    }
    const already_existed = created;
    created = true;
    return Promise.resolve({
      data: { invoice_id: "atomic-winner", already_existed },
      error: null,
    });
  }) as typeof mock.client.rpc;
  const body = {
    ...options,
    selections: [{ ...selection[0], expectedFingerprint }],
  };
  const responses = await Promise.all([
    handleRequest(request(body), deps(mock)),
    handleRequest(request(body), deps(mock)),
  ]);
  const results = await Promise.all(
    responses.map((response) => response.json()),
  );
  assertEquals(
    results.reduce((sum, result) => sum + result.invoicesCreated, 0),
    1,
  );
  assertEquals(
    results.reduce((sum, result) => sum + result.alreadyExisting.length, 0),
    1,
  );
});

Deno.test("future: skipping an unpaid prior month rejects whole batch before writes", async () => {
  const mock = planningFixture({ bookings: [mockBooking()] });
  const preview = await buildPlan(mock.client, "org-A", today, options);
  const selections = preview.lines.filter((line) =>
    line.periodStart !== "2026-12-01"
  ).map((line) => ({
    bookingId: line.bookingId,
    periodStart: line.periodStart,
    expectedFingerprint: line.previewFingerprint,
  }));
  const response = await handleRequest(
    request({ ...options, selections }),
    deps(mock),
  );
  assertEquals(response.status, 409);
  assertEquals(mock.rpcCalls, []);
});

Deno.test("future: consecutive advance generates November, December and January in order", async () => {
  const mock = planningFixture({ bookings: [mockBooking()] });
  const preview = await buildPlan(mock.client, "org-A", today, options);
  const selections = preview.lines.map((line) => ({
    bookingId: line.bookingId,
    periodStart: line.periodStart,
    expectedFingerprint: line.previewFingerprint,
  })).reverse();
  const response = await handleRequest(
    request({ ...options, selections }),
    deps(mock),
  );
  assertEquals(response.status, 200);
  assertEquals((await response.json()).invoicesCreated, 3);
  assertEquals(
    mock.rpcCalls.filter((call) => call.fn === "create_recurring_invoice").map((
      call,
    ) => call.args?.p_billing_period_start),
    ["2026-11-01", "2026-12-01", "2027-01-01"],
  );
});

Deno.test("future: failure of prior month prevents dependent future RPC writes", async () => {
  const mock = planningFixture({ bookings: [mockBooking()] });
  const preview = await buildPlan(mock.client, "org-A", today, options);
  const selections = preview.lines.map((line) => ({
    bookingId: line.bookingId,
    periodStart: line.periodStart,
    expectedFingerprint: line.previewFingerprint,
  }));
  const originalRpc = mock.client.rpc;
  let writes = 0;
  mock.client.rpc = ((name: string, args: unknown) => {
    if (name !== "create_recurring_invoice") {
      return originalRpc(name, args as Record<string, unknown>);
    }
    writes++;
    return Promise.resolve({
      data: null,
      error: { message: "November rejected under lock" },
    });
  }) as typeof mock.client.rpc;
  const response = await handleRequest(
    request({ ...options, selections }),
    deps(mock),
  );
  const result = await response.json();
  assertEquals(writes, 1);
  assertEquals(result.invoicesCreated, 0);
  assertEquals(result.failed.length, 3);
});

Deno.test("future: mixed booking starts still execute grouped periods globally in order", async () => {
  const mock = planningFixture({
    bookings: [
      mockBooking({ start_date: "2026-12-01" }),
      mockBooking({ id: "booking-2", start_date: "2026-11-01" }),
    ],
  });
  const preview = await buildPlan(mock.client, "org-A", today, options);
  const selections = preview.lines.map((line) => ({
    bookingId: line.bookingId,
    periodStart: line.periodStart,
    expectedFingerprint: line.previewFingerprint,
  }));
  const response = await handleRequest(
    request({ ...options, selections }),
    deps(mock),
  );
  assertEquals((await response.json()).invoicesCreated, 3);
  assertEquals(
    mock.rpcCalls.filter((call) => call.fn === "create_recurring_invoice").map((
      call,
    ) => call.args?.p_billing_period_start),
    ["2026-11-01", "2026-12-01", "2027-01-01"],
  );
});

for (const secondStart of ["2026-11-16", "2026-11-17"]) {
  Deno.test(`future: daily coverage union ${secondStart} governs consecutive December advance`, async () => {
    const mock = planningFixture({
      bookings: [mockBooking()],
      direct: [
        invoiceFixture({
          id: "first-half",
          billing_period_start: "2026-11-01",
          billing_period_end: "2026-11-15",
        }),
        invoiceFixture({
          id: "second-half",
          billing_period_start: secondStart,
          billing_period_end: "2026-11-30",
        }),
      ],
    });
    const futureOptions = {
      includeFuturePeriods: true,
      futureThroughMonth: "2026-12",
    };
    const preview = await buildPlan(mock.client, "org-A", today, futureOptions);
    const december = preview.lines.find((line) =>
      line.periodStart === "2026-12-01"
    )!;
    const response = await handleRequest(
      request({
        ...futureOptions,
        selections: [{
          bookingId: december.bookingId,
          periodStart: december.periodStart,
          expectedFingerprint: december.previewFingerprint,
        }],
      }),
      deps(mock),
    );
    assertEquals(response.status, secondStart === "2026-11-16" ? 200 : 409);
    assertEquals(
      mock.rpcCalls.filter((call) => call.fn === "create_recurring_invoice")
        .length,
      secondStart === "2026-11-16" ? 1 : 0,
    );
  });
}
