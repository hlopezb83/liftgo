// The real planner owns catch-up, history, eligibility and amount calculations.
import {
  assertEquals,
  assertRejects,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import { buildPlan } from "./handler.ts";
import { dateOnlyToMty, MAX_CATCHUP_ITERATIONS } from "./periods.ts";
import {
  bookingFixture,
  invoiceFixture,
  planningFixture,
} from "./testFixtures.ts";

async function plan(
  lastBilled: string | null,
  startDate: string,
  endDate: string | null,
  today: string,
) {
  const mock = planningFixture({
    bookings: [
      bookingFixture({
        start_date: startDate,
        end_date: endDate,
        last_billed_date: lastBilled,
      }),
    ],
    direct: lastBilled
      ? [invoiceFixture({ billing_period_end: lastBilled })]
      : [],
  });
  return await buildPlan(mock.client, "org-A", dateOnlyToMty(today));
}

Deno.test("catch-up: delayed booking recovers May, June and current July", async () => {
  const result = await plan(
    "2026-04-30",
    "2025-01-01",
    "2029-01-01",
    "2026-07-21",
  );
  assertEquals(result.items.map((item) => [item.startStr, item.endStr]), [
    ["2026-05-01", "2026-05-31"],
    ["2026-06-01", "2026-06-30"],
    ["2026-07-01", "2026-07-31"],
  ]);
  assertEquals(result.truncated, false);
  assertEquals(result.pendingCount, 0);
});

Deno.test("catch-up: current booking only generates current month", async () => {
  const result = await plan(
    "2026-06-30",
    "2025-01-01",
    "2029-01-01",
    "2026-07-21",
  );
  assertEquals(result.items.map((item) => [item.startStr, item.endStr]), [[
    "2026-07-01",
    "2026-07-31",
  ]]);
});

Deno.test("catch-up: paid current month emits existing/future preview but no item", async () => {
  const mock = planningFixture({
    direct: [
      invoiceFixture({
        billing_period_start: "2026-07-01",
        billing_period_end: "2026-07-31",
      }),
    ],
  });
  const result = await buildPlan(
    mock.client,
    "org-A",
    dateOnlyToMty("2026-07-21"),
  );
  assertEquals(result.items, []);
  assertEquals(result.lines.map((line) => line.reason), [
    "already_invoiced",
    "period_in_future",
  ]);
  assertEquals(result.lines[0].existingInvoiceId, "invoice-1");
});

Deno.test("catch-up: month-end contract boundary stops before July", async () => {
  const result = await plan(
    "2026-04-30",
    "2025-01-01",
    "2026-06-30",
    "2026-07-21",
  );
  assertEquals(result.items.length, 2);
  assertEquals(result.items[1].endStr, "2026-06-30");
  assertEquals(result.lines.every((line) => line.eligible), true);
});

Deno.test("catch-up: paused six months recovers all seven due months", async () => {
  const result = await plan(
    "2025-12-31",
    "2025-01-01",
    "2029-01-01",
    "2026-07-21",
  );
  assertEquals(result.items.length, 7);
  assertEquals(result.items[0].startStr, "2026-01-01");
  assertEquals(result.items[6].endStr, "2026-07-31");
});

Deno.test("catch-up: actual loop caps 24 periods and reports 54 pending", async () => {
  const result = await plan(
    "2020-01-31",
    "2019-01-01",
    "2050-01-01",
    "2026-07-21",
  );
  assertEquals(MAX_CATCHUP_ITERATIONS, 24);
  assertEquals(result.items.length, 24);
  assertEquals(result.items.at(-1)?.endStr, "2022-01-31");
  assertEquals(result.truncated, true);
  assertEquals(result.pendingCount, 54);
});

Deno.test("catch-up: exactly 24 due periods is not truncated", async () => {
  const result = await plan("2024-07-31", "2020-01-01", null, "2026-07-21");
  assertEquals(result.items.length, 24);
  assertEquals(result.truncated, false);
  assertEquals(result.pendingCount, 0);
});

Deno.test("catch-up: first partial period preserves inclusive days and next starts on first", async () => {
  const result = await plan(null, "2026-09-12", "2027-09-11", "2026-10-20");
  assertEquals(
    result.items.map((
      item,
    ) => [
      item.startStr,
      item.endStr,
      item.isProrated,
      item.proratedDays,
      item.billedAmount,
    ]),
    [
      ["2026-09-12", "2026-09-30", true, 19, 1963.33],
      ["2026-10-01", "2026-10-31", false, 0, 3100],
    ],
  );
});

Deno.test("catch-up: final partial period is prorated, not billed through month end", async () => {
  const result = await plan(
    "2026-05-31",
    "2025-01-01",
    "2026-06-15",
    "2026-07-21",
  );
  assertEquals(
    result.items.map((
      item,
    ) => [item.startStr, item.endStr, item.proratedDays, item.billedAmount]),
    [["2026-06-01", "2026-06-15", 15, 1550]],
  );
  assertEquals(result.lines[0].isProrated, true);
});

Deno.test("catch-up: end on next period start bills that one inclusive day", async () => {
  const result = await plan(
    "2026-06-30",
    "2025-01-01",
    "2026-07-01",
    "2026-07-21",
  );
  assertEquals(
    result.items.map((
      item,
    ) => [item.startStr, item.endStr, item.proratedDays, item.billedAmount]),
    [["2026-07-01", "2026-07-01", 1, 100]],
  );
});

Deno.test("catch-up: leap year partial cycle uses February 29", async () => {
  const result = await plan(null, "2024-02-15", "2024-02-29", "2024-03-01");
  assertEquals(
    result.items.map((
      item,
    ) => [item.startStr, item.endStr, item.proratedDays, item.billedAmount]),
    [["2024-02-15", "2024-02-29", 15, 1603.45]],
  );
});

Deno.test("catch-up: ended before first computed period is ineligible", async () => {
  const result = await plan(
    "2026-06-30",
    "2025-01-01",
    "2026-06-15",
    "2026-07-21",
  );
  assertEquals(result.items, []);
  assertEquals(result.lines[0].reason, "booking_ended");
});

Deno.test("history: direct + pivot merge overrides stale cursor, cancelled rows do not advance", async () => {
  const june = invoiceFixture();
  const mock = planningFixture({
    bookings: [
      bookingFixture({
        start_date: "2026-05-01",
        last_billed_date: "2029-12-31",
      }),
    ],
    linked: [{ invoices: june }, {
      invoices: invoiceFixture({
        id: "cancelled",
        billing_period_end: "2026-09-30",
        status: "cancelled",
        cfdi_status: "cancelled",
      }),
    }],
    direct: [
      june,
      invoiceFixture({ id: "may", billing_period_end: "2026-05-31" }),
    ],
  });
  const result = await buildPlan(
    mock.client,
    "org-A",
    dateOnlyToMty("2026-07-21"),
  );
  assertEquals(result.items.map((item) => item.startStr), ["2026-07-01"]);
  for (const table of ["invoice_bookings", "invoices"]) {
    const query = mock.queries.find((query) => query.table === table)!;
    assertEquals(query.filters, [
      { col: "booking_id", val: "booking-1" },
      {
        col: table === "invoices"
          ? "organization_id"
          : "invoices.organization_id",
        val: "org-A",
      },
    ]);
  }
});

Deno.test("history: pending fiscal cancellation still occupies a direct-link period", async () => {
  const mock = planningFixture({
    direct: [
      invoiceFixture({
        billing_period_end: "2026-07-31",
        status: "cancelled",
        cfdi_status: "stamped",
        cfdi_uuid: "uuid",
        cancellation_status: "pending",
      }),
    ],
  });
  assertEquals(
    (await buildPlan(mock.client, "org-A", dateOnlyToMty("2026-07-21"))).items,
    [],
  );
});

Deno.test("history: no live history clears cached cursor; legacy without period retains it", async () => {
  const booking = bookingFixture({
    last_billed_date: "2026-06-30",
    start_date: "2026-05-01",
  });
  const empty = planningFixture({ bookings: [booking] });
  assertEquals(
    (await buildPlan(empty.client, "org-A", dateOnlyToMty("2026-07-21"))).items
      .length,
    3,
  );
  const legacy = planningFixture({
    bookings: [booking],
    direct: [
      invoiceFixture({ billing_period_start: null, billing_period_end: null }),
    ],
  });
  assertEquals(
    (await buildPlan(legacy.client, "org-A", dateOnlyToMty("2026-07-21"))).items
      .map((item) => item.startStr),
    ["2026-07-01"],
  );
});

for (
  const failTable of [
    "bookings",
    "organization_customers",
    "invoice_bookings",
    "invoices",
  ]
) {
  Deno.test(`planner fails closed on ${failTable} read error`, async () => {
    const mock = planningFixture({ failTable });
    await assertRejects(
      () => buildPlan(mock.client, "org-A", dateOnlyToMty("2026-07-21")),
      Error,
      `failed ${failTable}`,
    );
    assertEquals(mock.rpcCalls, []);
  });
}

Deno.test("planner: zero agreed rate is valid, only absent configured rate blocks", async () => {
  const mock = planningFixture({
    bookings: [
      bookingFixture({ id: "zero", monthly_rate: 0 }),
      bookingFixture({ id: "missing", monthly_rate: null, forklifts: null }),
    ],
  });
  const result = await buildPlan(
    mock.client,
    "org-A",
    dateOnlyToMty("2026-07-21"),
  );
  assertEquals(
    result.items.map((item) => [item.bookingId, item.billedAmount]),
    [["zero", 0]],
  );
  assertEquals(result.lines[1].reason, "no_monthly_rate");
});
