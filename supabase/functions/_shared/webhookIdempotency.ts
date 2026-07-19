// BL-43: helper de idempotencia para eventos externos.
// Uso:
//   const claim = await claimWebhookEvent(admin, {
//     provider: "facturapi",
//     eventId: req.headers.get("x-facturapi-event-id") ?? hashPayload(body),
//     eventType: "invoice.status.updated",
//     payload: body,
//   });
//   if (claim.duplicate) return jsonResponse(req, { ok: true, duplicate: true });
//   try { ... ; await claim.markProcessed(); }
//   catch (err) { await claim.markFailed(err); throw err; }
import type { SupabaseLike } from "./types.ts";

export interface WebhookClaimInput {
  provider: string;
  eventId: string;
  eventType: string;
  payload: unknown;
}

export interface WebhookClaimResult {
  duplicate: boolean;
  id: string | null;
  markProcessed: () => Promise<void>;
  markFailed: (err: unknown) => Promise<void>;
}

const UNIQUE_VIOLATION = "23505";

// deno-lint-ignore no-explicit-any
function isUniqueViolation(err: any): boolean {
  return err?.code === UNIQUE_VIOLATION ||
    (typeof err?.message === "string" &&
      err.message.includes("webhook_events_provider_event_unique"));
}

export async function claimWebhookEvent(
  admin: SupabaseLike,
  input: WebhookClaimInput,
): Promise<WebhookClaimResult> {
  const insertRes = await admin
    .from("webhook_events")
    .insert({
      provider: input.provider,
      event_id: input.eventId,
      event_type: input.eventType,
      payload: input.payload ?? {},
      status: "pending",
    })
    .select("id")
    .single() as { data: { id: string } | null; error: unknown };

  if (insertRes.error) {
    if (isUniqueViolation(insertRes.error)) {
      // Ya lo procesamos (o está en curso): no-op idempotente.
      return {
        duplicate: true,
        id: null,
        markProcessed: () => Promise.resolve(),
        markFailed: () => Promise.resolve(),
      };
    }
    throw insertRes.error;
  }

  const id = insertRes.data?.id ?? null;

  return {
    duplicate: false,
    id,
    markProcessed: async () => {
      if (!id) return;
      await admin
        .from("webhook_events")
        .update({ status: "processed", processed_at: new Date().toISOString() })
        .eq("id", id);
    },
    markFailed: async (err: unknown) => {
      if (!id) return;
      const msg = err instanceof Error ? err.message : String(err);
      await admin
        .from("webhook_events")
        .update({
          status: "failed",
          processed_at: new Date().toISOString(),
          error_message: msg.slice(0, 2000),
        })
        .eq("id", id);
    },
  };
}
