import { isUUID } from "./validate.ts";

export type StampOutcome =
  | { kind: "issued" | "already_issued"; cfdi_uuid: string }
  | { kind: "in_progress" | "rejected" }
  | { kind: "recovery_required"; reference: "saved" | "unconfirmed" };

export function stampOutcome(stamp_outcome: StampOutcome) {
  return { stamp_outcome };
}

/** Validate the wire result independently of the HTTP status family. */
export function readStampOutcome(
  status: number,
  body: unknown,
): StampOutcome | null {
  if (!body || typeof body !== "object") return null;
  const reply = body as Record<string, unknown>;
  const value = reply.stamp_outcome;
  if (value && typeof value === "object") {
    const outcome = value as Record<string, unknown>;
    if (
      outcome.kind === "issued" && status === 200 && isUUID(outcome.cfdi_uuid)
    ) {
      return { kind: "issued", cfdi_uuid: outcome.cfdi_uuid };
    }
    if (
      outcome.kind === "already_issued" && status === 409 &&
      isUUID(outcome.cfdi_uuid)
    ) {
      return { kind: "already_issued", cfdi_uuid: outcome.cfdi_uuid };
    }
    if (outcome.kind === "in_progress" && status === 409) {
      return { kind: "in_progress" };
    }
    if (outcome.kind === "rejected" && status >= 400) {
      return { kind: "rejected" };
    }
    if (outcome.kind === "recovery_required") {
      if (
        outcome.reference === "saved" &&
        (status === 202 || status === 409 || status >= 500)
      ) {
        return { kind: "recovery_required", reference: "saved" };
      }
      if (outcome.reference === "unconfirmed" && status >= 500) {
        return { kind: "recovery_required", reference: "unconfirmed" };
      }
    }
    return null;
  }
  // The worker and endpoint may roll out separately. Trust only the old,
  // explicit success response with a UUID during that interval.
  if (status === 200 && reply.success === true && isUUID(reply.cfdi_uuid)) {
    return { kind: "issued", cfdi_uuid: reply.cfdi_uuid };
  }
  return null;
}
