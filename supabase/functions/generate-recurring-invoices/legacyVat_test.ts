import {
  assertEquals,
  assertStringIncludes,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { executePlan } from "./handler.ts";

for (const lineRate of [undefined, 11]) {
  Deno.test(`recurrence rejects inherited obsolete VAT without creating or advancing booking: ${lineRate}`, async () => {
    const writes: unknown[] = [];
    const calls: string[] = [];
    const quoteId = "10700000-0000-4000-8000-000000000001";
    const sourceId = "10700000-0000-4000-8000-000000000002";
    const supabase = {
      from: () => {
        const query = {
          select: () => query,
          eq: () => query,
          maybeSingle: () =>
            Promise.resolve({
              data: { tax_rate: lineRate === undefined ? 11 : 16 },
              error: null,
            }),
          update: (value: unknown) => {
            writes.push(value);
            return query;
          },
        };
        return query;
      },
      rpc: (name: string) => {
        calls.push(name);
        if (name !== "get_quote_charge_availability") {
          throw new Error("Unexpected write RPC");
        }
        return Promise.resolve({
          error: null,
          data: {
            complete: true,
            quotes: [{
              quote_id: quoteId,
              legacy_review_required: false,
              lines: lineRate === undefined ? [] : [{
                quote_line_id: sourceId,
                quoted_quantity: 1,
                consumed_quantity: 0,
                remaining_quantity: 1,
                line: {
                  quote_line_id: sourceId,
                  line_kind: "charge",
                  description: "Charge",
                  quantity: 1,
                  unit_price: 100,
                  tax_rate: lineRate,
                },
              }],
            }],
          },
        });
      },
    } as unknown as SupabaseClient;
    const item = {
      bookingId: "booking",
      organizationId: "org",
      customerId: "customer",
      quoteId,
      startStr: "2026-10-01",
      endStr: "2026-10-31",
      currency: "MXN",
      tipoCambio: 1,
      billingStart: new Date("2026-10-01"),
      billingEnd: new Date("2026-10-31"),
      billedAmount: 100,
      rateWarning: false,
    } as Parameters<typeof executePlan>[1][number];
    const result = await executePlan(supabase, [item]);
    assertEquals(result.created, []);
    assertEquals(result.failed.length, 1);
    assertStringIncludes(result.failed[0].error, "11%");
    assertEquals(calls, ["get_quote_charge_availability"]);
    assertEquals(writes, []);
  });
}
