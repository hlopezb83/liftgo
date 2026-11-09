// Synthetic parity cases, shared by regression tests and local benchmarks.
import { bookingFixture, invoiceFixture } from "./testFixtures.ts";
import { mergeLiveInvoiceHistory } from "./invoiceHistory.ts";
import type { PlanningContext } from "./planTypes.ts";
import type { FuturePeriodOptions } from "./futurePeriods.ts";

export function optimizationParityCases(): Array<{
  name: string;
  contexts: PlanningContext[];
  options: FuturePeriodOptions;
}> {
  const cases = [];
  const states = [
    { status: "draft", cfdi_status: null },
    { status: "cancelled", cfdi_status: null },
    { status: "cancelled", cfdi_status: "stamping" },
    {
      status: "cancelled",
      cfdi_status: "stamped",
      cancellation_status: "pending",
    },
    {
      status: "cancelled",
      cfdi_status: "stamped",
      cancellation_status: "rejected",
    },
    {
      status: "cancelled",
      cfdi_uuid: "synthetic",
      cancellation_status: "accepted",
    },
    { status: "pending", cfdi_status: "cancelled" },
    { status: "pending", cfdi_uuid: "synthetic", cancellation_status: null },
  ];
  for (let index = 0; index < 192; index++) {
    const state = states[index % states.length];
    const history = [
      invoiceFixture({
        id: "covered",
        billing_period_start: "2024-01-15",
        billing_period_end: "2026-09-30",
        ...state,
      }),
      invoiceFixture({
        id: "half-1",
        billing_period_start: "2026-10-01",
        billing_period_end: "2026-10-15",
      }),
      invoiceFixture({
        id: "half-2",
        billing_period_start: index % 3 ? "2026-10-16" : "2026-10-17",
        billing_period_end: "2026-10-31",
      }),
    ];
    if (index % 11 === 0) {
      history.push(
        invoiceFixture({
          id: "legacy",
          billing_period_start: null,
          billing_period_end: null,
        }),
      );
    }
    if (index % 13 === 0) {
      history.push(
        invoiceFixture({
          id: "invalid",
          billing_period_start: "2026-02-30",
          billing_period_end: "2026-03-10",
        }),
      );
    }
    const booking = bookingFixture({
      id: `parity-${index}`,
      organization_id: index % 2 ? "org-A" : "org-B",
      start_date: index % 17 === 0 ? "2026-02-30" : "2024-01-15",
      end_date: index % 7 ? "2027-02-10" : null,
      monthly_rate: index % 5 === 0 ? 0 : index % 5 === 1 ? null : 1234.567,
      forklifts: {
        name: "QA",
        serial_number: "QA",
        monthly_rate: index % 19 ? 3100 : null,
      },
      currency: index % 3 ? "MXN" : "USD",
      tipo_cambio: [1, 20.12, null][Math.floor(index / 3) % 3],
      customer_id: index % 23 ? "shared-customer" : null,
      updated_at: index % 2 ? "2026-10-20T13:00:00Z" : null,
      quote_id: index % 2 ? "source-quote" : null,
      quotes: index % 2
        ? {
          organization_id: index % 2 ? "org-A" : "org-B",
          line_items: [{
            line_kind: "transport",
            quantity: 1,
            unit_price: 123.45,
          }],
          rental_meta: [],
        }
        : null,
    });
    cases.push({
      name: `matrix-${String(index).padStart(3, "0")}`,
      contexts: [{
        booking,
        invoices: mergeLiveInvoiceHistory(
          history.map((invoices) => ({ invoices })),
          history,
        ),
        fiscal: {
          tax_rate: [null, 0, 8, 16][index % 4],
          uso_cfdi: index % 9 ? "G03" : null,
        },
        quoteIssue: index % 29 ? null : "quote_charge_review",
        chargeSnapshot: { complete: true, quotes: [] },
      } as PlanningContext],
      options: Math.floor(index / 8) % 2
        ? { includeFuturePeriods: true, futureThroughMonth: "2027-02" }
        : {},
    });
  }
  for (const count of [501, 1001, 5001]) {
    const history = Array.from(
      { length: count },
      (_, index) =>
        invoiceFixture({
          id: `history-${String(index).padStart(6, "0")}`,
          billing_period_start: "2026-10-01",
          billing_period_end: "2026-10-31",
        }),
    );
    cases.push({
      name: `large-history-${count}`,
      contexts: [{
        booking: bookingFixture({ start_date: "2026-11-01" }),
        invoices: history,
        fiscal: { tax_rate: 16, uso_cfdi: "G03" },
        quoteIssue: null,
        chargeSnapshot: null,
      }],
      options: { includeFuturePeriods: true, futureThroughMonth: "2027-10" },
    });
  }
  return cases;
}
