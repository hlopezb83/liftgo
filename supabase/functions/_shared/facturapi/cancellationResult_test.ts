import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { cancellationResult } from "./cancellationResult.ts";
Deno.test("PAC cancellation needs explicit known status", () => {
  for (
    const value of [
      null,
      undefined,
      {},
      [],
      { status: "valid" },
      { status: "valid", cancellation_status: "accepted" },
      { cancellation_status: null },
      { cancellation_status: "new" },
      { cancellation_status: "none" },
      { cancellation_status: "verifying" },
    ]
  ) {
    assertEquals(cancellationResult(value), { ok: false });
  }
  for (
    const status of ["accepted", "pending", "rejected", "expired"] as const
  ) {
    assertEquals(cancellationResult({ cancellation_status: status }), {
      ok: true,
      status,
    });
  }
});
