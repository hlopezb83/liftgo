import { handleCors } from "../_shared/cors.ts";
import { authenticateCronRequest } from "../_shared/cronAuth.ts";
import {
  createRequestDiagnostics,
  type EdgeDiagnostics,
} from "../_shared/edgeDiagnostics.ts";
import { jsonResponse } from "../_shared/http.ts";
import {
  DELETE_ENV_FLAG,
  deleteGateDecision,
} from "../_shared/storageDeletePhase.ts";
import {
  buildOrphanOwnerIndex,
  collectOrphanOwnerLookupKeys,
} from "../_shared/storageOrphanOwner.ts";
import { storageObjectKey } from "../_shared/storageOrphanReconciliation.ts";
import type { ManualResolutionRecord } from "../_shared/storageQuarantine.ts";
import { getAdminClient } from "../_shared/supabaseClients.ts";
import {
  collectCandidates,
  collectStorageInventory,
  type StorageInventoryCollection,
} from "./inventoryAndCandidates.ts";
import {
  applyBatch,
  deleteSourcesBatch,
  ensureLedger,
} from "./ledgerExecution.ts";
import {
  collectOrphanCandidates,
  collectUnreferencedUnscopedObjects,
  loadManualResolutions,
  loadOrphanLedgerRecords,
  loadOrphanOwnerIndex,
  reconcileOrphanSources,
} from "./orphanResolution.ts";
import {
  type AdminClient,
  APPLY_CONFIRMATION,
  APPLY_ENV_FLAG,
  type OrphanCandidate,
  parseInput,
  type RequestInput,
} from "./specsAndTypes.ts";
import {
  buildSummaryPayload,
  type Responder,
  runApplyOrphansMode,
} from "./summaryBuilder.ts";

async function runApplyReferencedMode(params: {
  admin: AdminClient;
  input: RequestInput;
  plan: Awaited<ReturnType<typeof collectCandidates>>;
  inventory: StorageInventoryCollection;
  unreferencedUnscoped: Array<{ bucketId: string; sourcePath: string }>;
  orphanCandidates: OrphanCandidate[];
  summary: ReturnType<typeof buildSummaryPayload>;
  respond: Responder;
}): Promise<Response> {
  const {
    admin,
    input,
    plan,
    inventory,
    unreferencedUnscoped,
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
  if (input.confirmation !== APPLY_CONFIRMATION) {
    return respond(
      { ...summary, error: "Explicit confirmation is required." },
      409,
    );
  }
  if (plan.truncated) {
    return respond(
      { ...summary, error: "Increase max_rows_per_reference before apply." },
      409,
    );
  }
  if (inventory.truncated) {
    return respond(
      { ...summary, error: "Increase max_objects_per_bucket before apply." },
      409,
    );
  }

  const existingObjectKeys = new Set<string>();
  for (const [bucketId, objectPaths] of inventory.objectPathsByBucket) {
    for (const objectPath of objectPaths) {
      existingObjectKeys.add(storageObjectKey(bucketId, objectPath));
    }
  }
  const reconciliation = await reconcileOrphanSources(
    admin,
    unreferencedUnscoped,
    await loadOrphanLedgerRecords(admin, unreferencedUnscoped),
    orphanCandidates.map((candidate) => ({
      bucketId: candidate.bucketId,
      sourcePath: candidate.sourcePath,
      organizationId: candidate.organizationId,
      destinationPath: candidate.destinationPath,
    })),
    existingObjectKeys,
    plan.activeOrganizationIds,
  );
  const applySummary = {
    ...summary,
    orphan_migration: {
      ...summary.orphan_migration,
      reconciled_sources: {
        reconciled: reconciliation.reconciled.length,
        blocking: reconciliation.blocking,
        verification_failed: reconciliation.verification_failed,
        by_reason: reconciliation.by_reason,
      },
    },
  };
  if (reconciliation.blocking > 0) {
    return respond(
      {
        ...applySummary,
        error: "Resolve unscoped unreferenced Storage objects before apply.",
      },
      409,
    );
  }

  await ensureLedger(admin, plan.candidates);
  const outcomes = await applyBatch(admin, input.batchSize);
  return respond({ ...applySummary, outcomes });
}

export interface StorageMigrationHandlerDeps {
  diagnostics?: EdgeDiagnostics;
}

export async function handleStorageMigration(
  req: Request,
  deps: StorageMigrationHandlerDeps = {},
): Promise<Response> {
  const cors = handleCors(req);
  if (cors) return cors;
  const respond: Responder = (body, status = 200) =>
    jsonResponse(req, body, { status });
  const diag = createRequestDiagnostics(deps.diagnostics);

  if (req.method !== "POST") {
    return respond({ error: "Method not allowed" }, 405);
  }

  const auth = await authenticateCronRequest(req);
  if (!auth.ok) return respond({ error: auth.error }, auth.status);
  diag.authenticated({ role: "service_role" });

  const input = await parseInput(req);
  if (!input) return respond({ error: "Invalid request" }, 400);

  const admin = getAdminClient();
  try {
    const plan = await collectCandidates(admin, input.maxRowsPerReference);
    const inventory = await collectStorageInventory(
      admin,
      plan.referencedPathsByBucket,
      input.maxObjectsPerBucket,
      plan.organizationIds,
    );
    const inventoryComplete = !plan.truncated && !inventory.truncated;
    const unreferencedUnscoped = collectUnreferencedUnscopedObjects(
      plan.organizationIds,
      inventory,
      plan.referencedPathsByBucket,
    );
    const ownerIndex = input.mode === "delete_sources"
      ? buildOrphanOwnerIndex([])
      : await loadOrphanOwnerIndex(
        admin,
        collectOrphanOwnerLookupKeys(unreferencedUnscoped),
      );
    const manualResolutions = input.mode === "delete_sources"
      ? new Map<string, ManualResolutionRecord>()
      : await loadManualResolutions(admin, unreferencedUnscoped);
    const orphans = collectOrphanCandidates(
      plan.organizationIds,
      unreferencedUnscoped,
      ownerIndex,
      manualResolutions,
      plan.activeOrganizationIds,
    );

    const summary = buildSummaryPayload({
      input,
      plan,
      inventory,
      inventoryComplete,
      orphans,
    });

    if (input.mode === "plan") return respond(summary);

    if (input.mode === "delete_sources") {
      const gate = deleteGateDecision({
        flagValue: Deno.env.get(DELETE_ENV_FLAG),
        confirmation: input.confirmation,
        inventoryComplete,
      });
      if (!gate.allowed) {
        return respond({ ...summary, error: gate.errorCode }, gate.status);
      }
      const outcomes = await deleteSourcesBatch(admin, input.batchSize);
      return respond({ ...summary, outcomes });
    }

    if (input.mode === "apply_orphans") {
      return await runApplyOrphansMode({
        admin,
        input,
        inventoryComplete,
        orphanCandidates: orphans.candidates,
        summary,
        respond,
      });
    }

    return await runApplyReferencedMode({
      admin,
      input,
      plan,
      inventory,
      unreferencedUnscoped,
      orphanCandidates: orphans.candidates,
      summary,
      respond,
    });
  } catch (err) {
    diag.capture(err, 500, "migrate_storage_unhandled");
    return respond({ error: "Storage migration operation failed." }, 500);
  }
}
