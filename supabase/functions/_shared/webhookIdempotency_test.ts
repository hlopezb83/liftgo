// Tests para _shared/webhookIdempotency helper.
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { claimWebhookEvent } from "./webhookIdempotency.ts";
import type { SupabaseLike } from "./types.ts";

function makeAdmin(behavior: {
  insertResponses: Array<{ data: { id: string } | null; error: unknown }>;
  updates: Array<Record<string, unknown>>;
}) {
  let insertIdx = 0;
  return {
    from(_t: string) {
      return {
        insert(_row: Record<string, unknown>) {
          const resp = behavior.insertResponses[insertIdx++];
          return {
            select(_c: string) {
              return {
                single() {
                  return Promise.resolve(resp);
                },
              };
            },
          };
        },
        update(patch: Record<string, unknown>) {
          behavior.updates.push(patch);
          return {
            eq(_col: string, _val: string) {
              return Promise.resolve({ data: null, error: null });
            },
          };
        },
      };
    },
  } as unknown as SupabaseLike;
}

Deno.test("claimWebhookEvent: primer evento → duplicate=false + markProcessed", async () => {
  const state = {
    insertResponses: [{ data: { id: "evt-1" }, error: null }],
    updates: [] as Array<Record<string, unknown>>,
  };
  const admin = makeAdmin(state);
  const claim = await claimWebhookEvent(admin, {
    provider: "facturapi",
    eventId: "fapi-123",
    eventType: "invoice.status.updated",
    payload: { foo: 1 },
  });
  assertEquals(claim.duplicate, false);
  assertEquals(claim.id, "evt-1");
  await claim.markProcessed();
  assertEquals(state.updates.length, 1);
  assertEquals(state.updates[0].status, "processed");
});

Deno.test("claimWebhookEvent: violación única → duplicate=true, no-op", async () => {
  const state = {
    insertResponses: [{
      data: null,
      error: { code: "23505", message: "duplicate key" },
    }],
    updates: [] as Array<Record<string, unknown>>,
  };
  const admin = makeAdmin(state);
  const claim = await claimWebhookEvent(admin, {
    provider: "facturapi",
    eventId: "fapi-123",
    eventType: "invoice.status.updated",
    payload: {},
  });
  assertEquals(claim.duplicate, true);
  assertEquals(claim.id, null);
  await claim.markProcessed();
  await claim.markFailed(new Error("x"));
  // No debe intentar actualizar filas (no somos dueños del evento).
  assertEquals(state.updates.length, 0);
});

Deno.test("claimWebhookEvent: markFailed persiste error truncado", async () => {
  const state = {
    insertResponses: [{ data: { id: "evt-2" }, error: null }],
    updates: [] as Array<Record<string, unknown>>,
  };
  const admin = makeAdmin(state);
  const claim = await claimWebhookEvent(admin, {
    provider: "facturapi",
    eventId: "fapi-999",
    eventType: "cancel.rejected",
    payload: {},
  });
  await claim.markFailed(new Error("boom"));
  assertEquals(state.updates[0].status, "failed");
  assertEquals(state.updates[0].error_message, "boom");
});
