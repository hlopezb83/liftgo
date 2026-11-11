import {
  assertEquals,
  assertThrows,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import { pendingCanonicalPeriods } from "./coverage.ts";
import { periodCoverage } from "./invoiceHistory.ts";
import { nextBillingPeriod } from "./periods.ts";
import { buildPlan } from "./handler.ts";
import { dateOnlyToMty, toIsoDate } from "./periods.ts";
import {
  bookingFixture,
  invoiceFixture,
  planningFixture,
} from "./testFixtures.ts";

Deno.test("coverage budget: 35 partial overlaps produce only 24 review rows", async () => {
  const direct = Array.from({ length: 35 }, (_, index) =>
    invoiceFixture({
      id: `partial-${index}`,
      billing_period_start: toIsoDate(new Date(Date.UTC(2024, index, 2))),
      billing_period_end: toIsoDate(new Date(Date.UTC(2024, index, 20))),
    }));
  const mock = planningFixture({
    bookings: [bookingFixture({ start_date: "2024-01-01" })],
    direct,
  });
  const plan = await buildPlan(
    mock.client,
    "org-A",
    dateOnlyToMty("2026-11-04"),
  );
  assertEquals(plan.lines.length, 24);
  assertEquals(plan.items.length, 0);
  assertEquals(
    plan.lines.every((line) => line.reason === "period_overlap_review"),
    true,
  );
  assertEquals(plan.truncated, true);
  assertEquals(plan.pendingCount, 11);
});

Deno.test("coverage budget: millennium-old uncovered contract has bounded output and exact remaining count", () => {
  const result = pendingCanonicalPeriods(
    "1000-01-01",
    null,
    dateOnlyToMty("2026-11-04"),
    [],
  );
  assertEquals(result.starts.length, 24);
  assertEquals(result.starts[0], "1000-01-01");
  assertEquals(result.starts.at(-1), "1001-12-01");
  assertEquals(result.pendingCount, 12299);
});

Deno.test("coverage budget: millennium covered interval jumps directly to current hole", () => {
  const result = pendingCanonicalPeriods(
    "1000-01-01",
    null,
    dateOnlyToMty("2026-11-04"),
    [invoiceFixture({
      billing_period_start: "1000-01-01",
      billing_period_end: "2026-10-31",
    })],
  );
  assertEquals(result, { starts: ["2026-11-01"], pendingCount: 0 });
});

Deno.test("coverage budget: merge nested/adjacent intervals but preserve partial month review", () => {
  const result = pendingCanonicalPeriods(
    "2026-01-15",
    "2026-05-12",
    dateOnlyToMty("2026-11-04"),
    [
      invoiceFixture({
        id: "first",
        billing_period_start: "2026-01-15",
        billing_period_end: "2026-02-28",
      }),
      invoiceFixture({
        id: "nested",
        billing_period_start: "2026-02-01",
        billing_period_end: "2026-02-28",
      }),
      invoiceFixture({
        id: "adjacent",
        billing_period_start: "2026-03-01",
        billing_period_end: "2026-03-31",
      }),
      invoiceFixture({
        id: "partial",
        billing_period_start: "2026-04-02",
        billing_period_end: "2026-04-30",
      }),
      invoiceFixture({
        id: "final",
        billing_period_start: "2026-05-01",
        billing_period_end: "2026-05-12",
      }),
    ],
  );
  assertEquals(result, { starts: ["2026-04-01"], pendingCount: 0 });
});

Deno.test("coverage budget: malformed or unsupported contract dates fail immediately", () => {
  for (const date of ["invalid", "2026-02-30", "100000-01-01", "0001-01-01"]) {
    assertThrows(() =>
      pendingCanonicalPeriods(date, null, dateOnlyToMty("2026-11-04"), [])
    );
  }
});

Deno.test("fingerprint: reopening prior coverage invalidates still-future selected month", async () => {
  const november = invoiceFixture({
    billing_period_start: "2026-11-01",
    billing_period_end: "2026-11-30",
    cfdi_uuid: "uuid",
    cfdi_status: "stamped",
    cancellation_status: "pending",
  });
  const mock = planningFixture({
    bookings: [bookingFixture({ start_date: "2026-11-01" })],
    direct: [november],
  });
  const options = { includeFuturePeriods: true, futureThroughMonth: "2026-12" };
  const before = await buildPlan(
    mock.client,
    "org-A",
    dateOnlyToMty("2026-11-04"),
    options,
  );
  assertEquals(before.lines.map((line) => line.periodStart), ["2026-12-01"]);
  november.cancellation_status = "accepted";
  november.occupies_booking_period = false;
  const after = await buildPlan(
    mock.client,
    "org-A",
    dateOnlyToMty("2026-11-04"),
    options,
  );
  assertEquals(after.lines.map((line) => line.periodStart), [
    "2026-11-01",
    "2026-12-01",
  ]);
  assertEquals(
    before.lines[0].previewFingerprint === after.lines[1].previewFingerprint,
    false,
  );
});

Deno.test("coverage intervals agree with bounded month-by-month oracle", () => {
  let state = 41;
  const random = (limit: number) => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state % limit;
  };
  for (let test = 0; test < 100; test++) {
    const start = toIsoDate(
      new Date(Date.UTC(2020, random(12), 1 + random(25))),
    );
    const end = toIsoDate(new Date(Date.UTC(2025, random(12), 1 + random(25))));
    const limit = dateOnlyToMty("2025-09-04");
    const invoices = Array.from({ length: 15 }, (_, index) => {
      const month = random(96);
      return invoiceFixture({
        id: `invoice-${index}`,
        billing_period_start: toIsoDate(
          new Date(Date.UTC(2019, month, 1 + random(20))),
        ),
        billing_period_end: toIsoDate(
          new Date(Date.UTC(2019, month + random(15), 21 + random(7))),
        ),
      });
    });
    const expected: string[] = [];
    let cursor: string | null = null;
    for (let month = 0; month < 100; month++) {
      const period = nextBillingPeriod(cursor, start, end);
      if (
        period.billingStart > limit || period.billingStart > dateOnlyToMty(end)
      ) break;
      const periodStart = toIsoDate(period.billingStart);
      const periodEnd = toIsoDate(period.billingEnd);
      if (periodCoverage(invoices, periodStart, periodEnd) !== "covered") {
        expected.push(periodStart);
      }
      cursor = periodEnd;
    }
    assertEquals(pendingCanonicalPeriods(start, end, limit, invoices), {
      starts: expected.slice(0, 24),
      pendingCount: Math.max(0, expected.length - 24),
    });
  }
});

for (const secondStart of ["2026-11-16", "2026-11-17"]) {
  Deno.test(`daily union: ${secondStart} distinguishes contiguous halves from a one-day hole`, async () => {
    const invoices = [
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
    ];
    const contiguous = secondStart === "2026-11-16";
    assertEquals(
      periodCoverage(invoices, "2026-11-01", "2026-11-30"),
      contiguous ? "covered" : "period_overlap_review",
    );
    assertEquals(
      pendingCanonicalPeriods(
        "2026-11-01",
        null,
        dateOnlyToMty("2026-12-31"),
        invoices,
      ).starts,
      contiguous ? ["2026-12-01"] : ["2026-11-01", "2026-12-01"],
    );
    const mock = planningFixture({
      bookings: [bookingFixture({ start_date: "2026-11-01" })],
      direct: invoices,
    });
    const plan = await buildPlan(
      mock.client,
      "org-A",
      dateOnlyToMty("2026-11-04"),
      { includeFuturePeriods: true, futureThroughMonth: "2026-12" },
    );
    assertEquals(
      plan.lines.map((line) => line.periodStart),
      contiguous ? ["2026-12-01"] : ["2026-11-01", "2026-12-01"],
    );
    if (!contiguous) {
      assertEquals(plan.lines[0].reason, "period_overlap_review");
    }
  });
}
