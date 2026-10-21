/** A successful transport is not evidence that SAT accepted cancellation. */
export function cancellationResult(value: unknown):
  | { ok: true; status: "accepted" | "pending" | "rejected" | "expired" }
  | { ok: false } {
  if (!value || typeof value !== "object") return { ok: false };
  const response = value as Record<string, unknown>;
  const status = response.cancellation_status;
  if (
    status === "accepted" && response.status != null &&
    response.status !== "canceled" && response.status !== "cancelled"
  ) return { ok: false };
  if (
    status === "accepted" || status === "pending" ||
    status === "rejected" || status === "expired"
  ) return { ok: true, status };
  // 'verifying', 'none', missing and new statuses need reconciliation. Keep
  // the pending claim; never finalize or reopen an uncertain cancellation.
  return { ok: false };
}
