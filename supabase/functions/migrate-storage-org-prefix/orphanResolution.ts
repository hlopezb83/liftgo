import {
  buildOrphanOwnerIndex,
  type OrphanOwnerIndex,
  type OrphanOwnerResolution,
  resolveOrphanOwner,
  summarizeOrphanOwnership,
} from "../_shared/storageOrphanOwner.ts";
import {
  type ApprovedOrphanOwner,
  classifyReconciledOrphanSources,
  type OrphanLedgerRecord,
  type OrphanReconciliationSummary,
  type ReconciledOrphanSource,
} from "../_shared/storageOrphanReconciliation.ts";
import {
  hasOrganizationStoragePrefix,
  organizationStoragePath,
} from "../_shared/storagePath.ts";
import {
  evaluateManualResolution,
  type ManualResolutionRecord,
  summarizeQuarantine,
} from "../_shared/storageQuarantine.ts";
import type { StorageInventoryCollection } from "./inventoryAndCandidates.ts";
import type { AdminClient, OrphanCandidate } from "./specsAndTypes.ts";
import {
  loadManualResolutions,
  loadOrphanLedgerRecords,
  storagePathExists,
  verifyCopyIntegrity,
} from "./storageIntegrity.ts";

export {
  loadManualResolutions,
  loadOrphanLedgerRecords,
  storagePathExists,
  verifyCopyIntegrity,
};

const OWNER_LOOKUP_CHUNK = 100;
const OWNER_LOOKUP_PAGE = 500;
const OWNER_LOOKUP_MAX_ROWS_PER_KEY = 50;

function isLookupKey(value: unknown): value is string {
  return typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
      .test(value);
}

async function fetchOwnerChunkRows(
  admin: AdminClient,
  column: "cfdi_uuid" | "id",
  chunk: string[],
): Promise<Array<Record<string, unknown>> | null> {
  const chunkRows: Array<Record<string, unknown>> = [];
  for (let offset = 0;; offset += OWNER_LOOKUP_PAGE) {
    const base = admin
      .from("supplier_bills")
      .select("id, cfdi_uuid, organization_id");
    const filtered = column === "cfdi_uuid"
      ? base.or(chunk.map((key) => `cfdi_uuid.ilike.${key}`).join(","))
      : base.in(column, chunk);
    const { data, error } = await filtered
      .order("id", { ascending: true })
      .range(offset, offset + OWNER_LOOKUP_PAGE - 1);
    if (error) return null;
    const page = (data ?? []) as Array<Record<string, unknown>>;
    chunkRows.push(...page);
    if (page.length < OWNER_LOOKUP_PAGE) return chunkRows;
    if (chunkRows.length > chunk.length * OWNER_LOOKUP_MAX_ROWS_PER_KEY) {
      return null;
    }
  }
}

async function readOwnerLookupColumn(
  admin: AdminClient,
  column: "cfdi_uuid" | "id",
  values: string[],
  rows: Array<{ id?: unknown; cfdiUuid?: unknown; organizationId?: unknown }>,
  complete: string[],
): Promise<void> {
  if (!values.every(isLookupKey)) return;
  for (let i = 0; i < values.length; i += OWNER_LOOKUP_CHUNK) {
    const chunk = values.slice(i, i + OWNER_LOOKUP_CHUNK);
    const chunkRows = await fetchOwnerChunkRows(admin, column, chunk);
    if (!chunkRows) return;
    for (const row of chunkRows) {
      rows.push({
        id: row.id,
        cfdiUuid: row.cfdi_uuid,
        organizationId: row.organization_id,
      });
    }
    complete.push(...chunk);
  }
}

export async function loadOrphanOwnerIndex(
  admin: AdminClient,
  keys: { cfdiUuid: string[]; id: string[] },
): Promise<OrphanOwnerIndex> {
  const rows: Array<
    { id?: unknown; cfdiUuid?: unknown; organizationId?: unknown }
  > = [];
  const completeCfdiUuid: string[] = [];
  const completeId: string[] = [];
  await readOwnerLookupColumn(
    admin,
    "cfdi_uuid",
    keys.cfdiUuid,
    rows,
    completeCfdiUuid,
  );
  await readOwnerLookupColumn(admin, "id", keys.id, rows, completeId);
  return buildOrphanOwnerIndex(rows, {
    cfdiUuid: completeCfdiUuid,
    id: completeId,
  });
}

export function collectUnreferencedUnscopedObjects(
  organizationIds: string[],
  inventory: StorageInventoryCollection,
  referencedPathsByBucket: Map<string, Set<string>>,
): Array<{ bucketId: string; sourcePath: string }> {
  if (inventory.truncated) return [];
  const result: Array<{ bucketId: string; sourcePath: string }> = [];
  for (const [bucketId, objectPaths] of inventory.objectPathsByBucket) {
    const referenced = referencedPathsByBucket.get(bucketId) ?? new Set();
    for (const sourcePath of objectPaths) {
      if (referenced.has(sourcePath)) continue;
      const alreadyScoped = organizationIds.some((organizationId) =>
        hasOrganizationStoragePrefix(organizationId, sourcePath)
      );
      if (!alreadyScoped) result.push({ bucketId, sourcePath });
    }
  }
  return result;
}

export function collectOrphanCandidates(
  organizationIds: string[],
  unreferencedUnscoped: Array<{ bucketId: string; sourcePath: string }>,
  ownerIndex: OrphanOwnerIndex,
  manualResolutions: Map<string, ManualResolutionRecord> = new Map(),
  activeOrganizationIds: string[] = organizationIds,
): {
  candidates: OrphanCandidate[];
  byBucket: ReturnType<typeof summarizeOrphanOwnership>;
  quarantine: ReturnType<typeof summarizeQuarantine>;
  manuallyResolved: number;
  manualResolutionsRejected: number;
} {
  const candidates: OrphanCandidate[] = [];
  const entries: Array<
    { bucketId: string; resolution: OrphanOwnerResolution }
  > = [];
  let manuallyResolved = 0;
  let manualResolutionsRejected = 0;

  for (const { bucketId, sourcePath } of unreferencedUnscoped) {
    const resolution = resolveOrphanOwner({
      bucketId,
      sourcePath,
      index: ownerIndex,
      knownOrganizationIds: organizationIds,
    });
    entries.push({ bucketId, resolution });
    if (resolution.status !== "resolved") {
      const record = manualResolutions.get(`${bucketId}\n${sourcePath}`) ??
        null;
      if (record === null) continue;
      const decision = evaluateManualResolution({
        bucketId,
        sourcePath,
        derived: resolution,
        record,
        activeOrganizationIds,
        knownOrganizationIds: organizationIds,
      });
      if (!decision.allowed) {
        manualResolutionsRejected++;
        continue;
      }
      manuallyResolved++;
      candidates.push({
        bucketId,
        organizationId: decision.organizationId,
        sourcePath,
        destinationPath: organizationStoragePath(
          decision.organizationId,
          sourcePath,
        ),
        ownerResolutionMethod: "manual_resolution",
      });
      continue;
    }

    candidates.push({
      bucketId,
      organizationId: resolution.organizationId,
      sourcePath,
      destinationPath: organizationStoragePath(
        resolution.organizationId,
        sourcePath,
      ),
      ownerResolutionMethod: resolution.method,
    });
  }

  const byBucket = summarizeOrphanOwnership(entries);
  return {
    candidates,
    byBucket,
    quarantine: summarizeQuarantine(entries, byBucket),
    manuallyResolved,
    manualResolutionsRejected,
  };
}

export async function reconcileOrphanSources(
  admin: AdminClient,
  objects: Array<{ bucketId: string; sourcePath: string }>,
  ledgerRecords: OrphanLedgerRecord[],
  approvedOwners: ApprovedOrphanOwner[],
  existingObjectKeys: ReadonlySet<string>,
  activeOrganizationIds: string[],
): Promise<OrphanReconciliationSummary & { verification_failed: number }> {
  const classified = classifyReconciledOrphanSources({
    objects,
    ledgerRecords,
    approvedOwners,
    existingObjectKeys,
    activeOrganizationIds,
  });

  const verified: ReconciledOrphanSource[] = [];
  let verificationFailed = 0;
  for (const candidate of classified.reconciled) {
    if (candidate.recordKind === "referenced") {
      verified.push(candidate);
      continue;
    }
    const verdict = await verifyCopyIntegrity(admin, {
      id: "",
      bucket_id: candidate.bucketId,
      organization_id: candidate.organizationId,
      source_path: candidate.sourcePath,
      destination_path: candidate.destinationPath,
      discovery_kind: "orphaned",
      status: "copied",
      attempt_count: 0,
    });
    if (verdict === "verified") verified.push(candidate);
    else verificationFailed++;
  }

  return {
    reconciled: verified,
    blocking: classified.blocking + verificationFailed,
    by_reason: classified.by_reason,
    verification_failed: verificationFailed,
  };
}
