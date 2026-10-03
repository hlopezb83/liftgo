import type { OrgQueryClient } from "../_shared/orgContext.ts";

export type QueueSnapshot = {
  id: string;
  organization_id: string;
  status: string;
  updated_at: string;
};
export type QueueLease = {
  id: string;
  organizationId: string;
  updatedAt: string;
};

export class QueueMutationError extends Error {
  constructor(readonly kind: "lease_lost" | "queue_write_error") {
    super(
      kind === "lease_lost"
        ? "Queue ownership changed"
        : "Queue write unavailable",
    );
    this.name = "QueueMutationError";
  }
}

/** El token proviene de RETURNING: un trigger puede cambiar updated_at. */
export async function claimQueueLease(
  admin: OrgQueryClient,
  row: QueueSnapshot,
  claimedAt: string,
): Promise<QueueLease | null> {
  if (!row.organization_id || !row.updated_at) {
    throw new QueueMutationError("queue_write_error");
  }
  const { data, error } = await admin.from("cfdi_retry_queue")
    .update({ status: "processing", updated_at: claimedAt })
    .eq("id", row.id).eq("organization_id", row.organization_id)
    .eq("status", row.status).eq("updated_at", row.updated_at)
    .select("id, updated_at").maybeSingle();
  if (error) throw new QueueMutationError("queue_write_error");
  if (!data) return null;
  if (
    data.id !== row.id || typeof data.updated_at !== "string" ||
    !data.updated_at
  ) {
    throw new QueueMutationError("queue_write_error");
  }
  return {
    id: row.id,
    organizationId: row.organization_id,
    updatedAt: data.updated_at,
  };
}

/** Un proceso antiguo no termina ni reprograma la reserva de otro. */
export async function markOwnedQueueRow(
  admin: OrgQueryClient,
  lease: QueueLease,
  patch: Record<string, unknown>,
): Promise<void> {
  const { data, error } = await admin.from("cfdi_retry_queue")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", lease.id).eq("organization_id", lease.organizationId)
    .eq("status", "processing").eq("updated_at", lease.updatedAt)
    .select("id").maybeSingle();
  if (error) throw new QueueMutationError("queue_write_error");
  if (!data) throw new QueueMutationError("lease_lost");
}

export async function assertOwnedQueue(
  admin: OrgQueryClient,
  lease: QueueLease,
): Promise<void> {
  const { data, error } = await admin.from("cfdi_retry_queue").select("id")
    .eq("id", lease.id).eq("organization_id", lease.organizationId)
    .eq("status", "processing").eq("updated_at", lease.updatedAt).maybeSingle();
  if (error) throw new QueueMutationError("queue_write_error");
  if (!data) throw new QueueMutationError("lease_lost");
}
