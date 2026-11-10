import { deepStrictEqual as equal } from "node:assert/strict";
import baseline from "./optimizationBaseline.json" with { type: "json" };
import { optimizationParityCases } from "./optimizationFixtures.ts";
import { planRecurringInvoices } from "./planner.ts";
import { pendingCanonicalPeriodsFromCoverage } from "./coverage.ts";
import { bookingFixture, invoiceFixture } from "./testFixtures.ts";
import type { PlanningContext } from "./planTypes.ts";

const today = new Date("2026-11-08T00:00:00Z");
const future = { includeFuturePeriods: true, futureThroughMonth: "2027-01" };
const context = (): PlanningContext => ({
  booking: bookingFixture({ start_date: "2026-11-01" }),
  invoices: [],
  fiscal: { tax_rate: 16, uso_cfdi: "G03" },
  quoteIssue: null,
  chargeSnapshot: null,
});
for (const fixture of optimizationParityCases()) {
  Deno.test(`phase 2 exact baseline parity: ${fixture.name}`, async () => {
    const before = JSON.stringify(fixture.contexts);
    let output: unknown;
    try {
      output = await planRecurringInvoices(
        fixture.contexts,
        today,
        fixture.options,
      );
    } catch (error) {
      output = { error: (error as Error).message };
    }
    const digest = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(JSON.stringify(output)),
    );
    const hash = Array.from(
      new Uint8Array(digest),
      (byte) => byte.toString(16).padStart(2, "0"),
    ).join("");
    equal(
      hash,
      baseline.cases[fixture.name as keyof typeof baseline.cases],
      `Changed full plan/fingerprint contract from ${baseline.baseline}`,
    );
    equal(JSON.stringify(fixture.contexts), before);
  });
}

Deno.test("phase 2 never reads historical invoice line items", async () => {
  const source = context();
  const invoice = invoiceFixture();
  Object.defineProperty(invoice, "line_items", {
    get: () => {
      throw new Error("Unexpected historical payload access");
    },
  });
  source.invoices = [invoice];
  const plan = await planRecurringInvoices([source], today, future);
  equal(plan.items.length, 3);
});

Deno.test("phase 2 computes fiscal hash once per eligible booking, not per month", async () => {
  const digest = crypto.subtle.digest.bind(crypto.subtle);
  let hashes = 0;
  crypto.subtle.digest = ((...args: Parameters<typeof digest>) => {
    hashes++;
    return digest(...args);
  }) as typeof digest;
  try {
    const plan = await planRecurringInvoices([context()], today, future);
    equal(plan.items.length, 3);
    equal(hashes, 4); // Three unchanged commercial hashes + one fiscal hash.
    equal(new Set(plan.items.map((item) => item.fiscalFingerprint)).size, 1);
  } finally {
    crypto.subtle.digest = digest;
  }
});

Deno.test("phase 2 fiscal reuse is lazy and never crosses calls or tenants", async () => {
  const first = context();
  const second = context();
  second.booking = { ...second.booking, organization_id: "org-B" };
  second.fiscal = { tax_rate: 8, uso_cfdi: "I08" };
  const [a, b] = await Promise.all([
    planRecurringInvoices([first], today, future),
    planRecurringInvoices([second], today, future),
  ]);
  equal(a.items[0].fiscalFingerprint === b.items[0].fiscalFingerprint, false);
  first.fiscal!.tax_rate = 0;
  const changed = await planRecurringInvoices([first], today, future);
  equal(
    changed.items[0].fiscalFingerprint === a.items[0].fiscalFingerprint,
    false,
  );
  equal(changed.lines[0].taxRate, 0);
  const blocked = context();
  blocked.booking.customer_id = null;
  Object.defineProperty(blocked.fiscal!, "uso_cfdi", {
    get: () => {
      throw new Error("Ineligible booking must not hash fiscal state");
    },
  });
  equal((await planRecurringInvoices([blocked], today, future)).items, []);
});

Deno.test("phase 2 keeps no-candidate coverage lazy", async () => {
  equal(
    pendingCanonicalPeriodsFromCoverage("2028-01-01", null, today, () => {
      throw new Error("No-candidate coverage evaluated");
    }),
    { starts: [], pendingCount: 0 },
  );
  const source = context();
  source.booking.start_date = "2028-01-01";
  const invoice = invoiceFixture();
  // Validation must not inspect a date that will never be used for coverage.
  // The unchanged fingerprint snapshot can copy the primitive without parsing it.
  invoice.billing_period_start = "not-a-date";
  source.invoices = [invoice];
  const plan = await planRecurringInvoices([source], today, future);
  equal(plan, { items: [], lines: [], truncated: false, pendingCount: 0 });
});
