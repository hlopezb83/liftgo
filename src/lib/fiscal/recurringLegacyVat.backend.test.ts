import { it, vi } from "vitest";
import assert from "node:assert/strict";
vi.mock("../../../supabase/functions/_shared/supabaseClients.ts", () => ({ getAdminClient: vi.fn() }));
vi.stubGlobal("Deno", { serve: vi.fn(), env: { get: () => undefined } });
const edgeModulePath = "../../../supabase/functions/generate-recurring-invoices/index.ts";
const { executePlan } = await import(/* @vite-ignore */ edgeModulePath);
for (const lineRate of [undefined, 11]) {
  it(`recurrence rejects inherited obsolete VAT without creating or advancing booking: ${lineRate}`, async () => {
    const writes: unknown[] = [];
    const calls: string[] = [];
    const quoteId = "10700000-0000-4000-8000-000000000001";
    const sourceId = "10700000-0000-4000-8000-000000000002";
    const supabase = {
      from: () => {
        const query = {
          select: () => query,
          eq: () => query,
          maybeSingle: () => Promise.resolve({ data: { tax_rate: lineRate === undefined ? 11 : 16 }, error: null }),
          update: (value: unknown) => { writes.push(value); return query; },
        };
        return query;
      },
      rpc: (name: string) => {
        calls.push(name);
        if (name !== "get_quote_charge_availability") throw new Error("Unexpected write RPC");
        return Promise.resolve({ error: null, data: { complete: true, quotes: [{ quote_id: quoteId, legacy_review_required: false, lines: lineRate === undefined ? [] : [{
          quote_line_id: sourceId, quoted_quantity: 1, consumed_quantity: 0, remaining_quantity: 1,
          line: { quote_line_id: sourceId, line_kind: "charge", description: "Charge", quantity: 1, unit_price: 100, tax_rate: lineRate },
        }] }] } });
      },
    };
    const item = {
      bookingId: "booking", organizationId: "org", customerId: "customer", quoteId,
      startStr: "2026-10-01", endStr: "2026-10-31", currency: "MXN", tipoCambio: 1,
      billingStart: new Date("2026-10-01"), billingEnd: new Date("2026-10-31"), billedAmount: 100,
      rateWarning: false,
    };
    const result = await executePlan(supabase, [item]);
    assert.deepEqual(result.created, []);
    assert.deepEqual(result.failed.length, 1);
    assert.match(result.failed[0].error, /11%/);
    assert.deepEqual(calls, ["get_quote_charge_availability"]);
    assert.deepEqual(writes, []);
  });
}
