import { DELETE_ENV_FLAG } from "../_shared/storageDeletePhase.ts";
import type {
  collectCandidates,
  StorageInventoryCollection,
} from "./inventoryAndCandidates.ts";
import { applyOrphanBatch, ensureOrphanLedger } from "./ledgerExecution.ts";
import type { collectOrphanCandidates } from "./orphanResolution.ts";
import {
  type AdminClient,
  APPLY_ENV_FLAG,
  countByBucket,
  ORPHAN_APPLY_CONFIRMATION,
  type OrphanCandidate,
  type RequestInput,
} from "./specsAndTypes.ts";

export type Responder = (body: unknown, status?: number) => Response;

export function buildSummaryPayload(params: {
  input: RequestInput;
  plan: Awaited<ReturnType<typeof collectCandidates>>;
  inventory: StorageInventoryCollection;
  inventoryComplete: boolean;
  orphans: ReturnType<typeof collectOrphanCandidates>;
}) {
  const { input, plan, inventory, inventoryComplete, orphans } = params;
  const orphanState = !inventoryComplete ? "inventory_incomplete" : "ready";
  return {
    mode: input.mode,
    truncated: !inventoryComplete,
    counts: plan.counts,
    by_bucket: countByBucket(plan.candidates),
    storage_inventory: {
      complete: inventoryComplete,
      unreferenced_scoped_objects: inventoryComplete
        ? inventory.unreferencedScopedObjects
        : null,
      unreferenced_unscoped_objects: inventoryComplete
        ? inventory.unreferencedUnscopedObjects
        : null,
      by_bucket: inventory.byBucket.map((bucket) => ({
        ...bucket,
        unreferenced_objects: inventoryComplete
          ? bucket.unreferenced_objects
          : null,
        unreferenced_scoped_objects: inventoryComplete
          ? bucket.unreferenced_scoped_objects
          : null,
        unreferenced_unscoped_objects: inventoryComplete
          ? bucket.unreferenced_unscoped_objects
          : null,
      })),
    },
    orphan_migration: {
      state: orphanState,
      candidates: inventoryComplete ? orphans.candidates.length : null,
      owner_resolution: inventoryComplete
        ? {
          resolved: orphans.byBucket.reduce(
            (sum, bucket) => sum + bucket.owner_resolved,
            0,
          ),
          missing: orphans.byBucket.reduce(
            (sum, bucket) => sum + bucket.owner_missing,
            0,
          ),
          conflicting: orphans.byBucket.reduce(
            (sum, bucket) => sum + bucket.owner_conflicting,
            0,
          ),
          by_bucket: orphans.byBucket,
        }
        : null,
      quarantine: inventoryComplete ? orphans.quarantine : null,
      manual_resolution: inventoryComplete
        ? {
          accepted: orphans.manuallyResolved,
          rejected: orphans.manualResolutionsRejected,
        }
        : null,
      deletion: "never_allowed",
    },
    source_deletion: {
      phase: "separate",
      enabled: Deno.env.get(DELETE_ENV_FLAG) === "true",
    },
  };
}

export async function runApplyOrphansMode(params: {
  admin: AdminClient;
  input: RequestInput;
  inventoryComplete: boolean;
  orphanCandidates: OrphanCandidate[];
  summary: ReturnType<typeof buildSummaryPayload>;
  respond: Responder;
}): Promise<Response> {
  const {
    admin,
    input,
    inventoryComplete,
    orphanCandidates,
    summary,
    respond,
  } = params;
  if (Deno.env.get(APPLY_ENV_FLAG) !== "true") {
    return respond(
      {
        ...summary,
        error: "Apply is disabled until the environment gate is enabled.",
      },
      403,
    );
  }
  if (input.confirmation !== ORPHAN_APPLY_CONFIRMATION) {
    return respond(
      { ...summary, error: "Explicit orphan confirmation is required." },
      409,
    );
  }
  if (!inventoryComplete) {
    return respond(
      { ...summary, error: "Complete the inventory before applying." },
      409,
    );
  }
  if (orphanCandidates.length === 0) {
    return respond(
      { ...summary, error: "No orphan has a uniquely resolved owner." },
      409,
    );
  }

  await ensureOrphanLedger(admin, orphanCandidates);
  const outcomes = await applyOrphanBatch(
    admin,
    input.batchSize,
    orphanCandidates,
  );
  return respond({ ...summary, outcomes });
}
