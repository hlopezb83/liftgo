import {
  partitionStorageList,
  type StorageInventoryBucket,
  type StorageListItem,
  summarizeStorageInventory,
} from "../_shared/storageInventory.ts";
import { makeStorageMigrationPlan } from "../_shared/storageMigrationPlan.ts";
import {
  type AdminClient,
  type CandidateCounts,
  type CandidateReference,
  emptyCounts,
  MAX_PREFIXES_PER_BUCKET,
  REFERENCE_SPECS,
  type ReferenceSpec,
  storageBucketIds,
} from "./specsAndTypes.ts";

interface PrefixScanState {
  maxObjects: number;
  objectPaths: Set<string>;
  scheduledPrefixes: Set<string>;
  pendingPrefixes: string[];
}

function recordPrefixPartition(
  prefix: string,
  rows: StorageListItem[],
  state: PrefixScanState,
): boolean {
  const partition = partitionStorageList(prefix, rows);
  for (const folder of partition.folders) {
    if (!state.scheduledPrefixes.has(folder)) {
      state.scheduledPrefixes.add(folder);
      state.pendingPrefixes.push(folder);
    }
  }
  for (const path of partition.objectPaths) {
    const sizeBefore = state.objectPaths.size;
    state.objectPaths.add(path);
    if (state.objectPaths.size > state.maxObjects) {
      if (state.objectPaths.size > sizeBefore) state.objectPaths.delete(path);
      return true;
    }
  }
  return false;
}

async function scanPrefixPages(
  admin: AdminClient,
  bucketId: string,
  prefix: string,
  state: PrefixScanState,
): Promise<boolean> {
  let offset = 0;
  for (;;) {
    const { data, error } = await admin.storage
      .from(bucketId)
      .list(prefix, { limit: 1_000, offset });
    if (error) {
      throw new Error("No se pudo inventariar el bucket de Storage.");
    }
    const rows = (data ?? []) as StorageListItem[];
    if (recordPrefixPartition(prefix, rows, state)) return true;
    if (rows.length < 1_000) return false;
    offset += rows.length;
  }
}

async function inventoryBucketObjects(
  admin: AdminClient,
  bucketId: string,
  referencedPaths: Iterable<string>,
  maxObjects: number,
  organizationIds: Iterable<string> = [],
): Promise<{
  summary: ReturnType<typeof summarizeStorageInventory>;
  objectPaths: Set<string>;
  truncated: boolean;
}> {
  const pendingPrefixes = [""];
  const state: PrefixScanState = {
    maxObjects,
    objectPaths: new Set<string>(),
    scheduledPrefixes: new Set(pendingPrefixes),
    pendingPrefixes,
  };
  const visitedPrefixes = new Set<string>();
  let truncated = false;

  while (state.pendingPrefixes.length > 0 && !truncated) {
    const prefix = state.pendingPrefixes.shift();
    if (prefix === undefined || visitedPrefixes.has(prefix)) continue;
    visitedPrefixes.add(prefix);
    if (visitedPrefixes.size > MAX_PREFIXES_PER_BUCKET) {
      truncated = true;
      break;
    }
    truncated = await scanPrefixPages(admin, bucketId, prefix, state);
  }

  return {
    summary: summarizeStorageInventory(
      bucketId,
      state.objectPaths,
      referencedPaths,
      organizationIds,
    ),
    objectPaths: state.objectPaths,
    truncated,
  };
}

export interface StorageInventoryCollection {
  byBucket: Array<ReturnType<typeof summarizeStorageInventory>>;
  objectPathsByBucket: Map<string, Set<string>>;
  unreferencedObjects: number;
  unreferencedScopedObjects: number;
  unreferencedUnscopedObjects: number;
  truncated: boolean;
}

export async function collectStorageInventory(
  admin: AdminClient,
  referencedPathsByBucket: Map<string, Set<string>>,
  maxObjectsPerBucket: number,
  organizationIds: string[] = [],
): Promise<StorageInventoryCollection> {
  const byBucket: Array<ReturnType<typeof summarizeStorageInventory>> = [];
  const objectPathsByBucket = new Map<string, Set<string>>();
  let truncated = false;

  for (const bucketId of storageBucketIds()) {
    const inventory = await inventoryBucketObjects(
      admin,
      bucketId,
      referencedPathsByBucket.get(bucketId) ?? [],
      maxObjectsPerBucket,
      organizationIds,
    );
    byBucket.push(inventory.summary);
    objectPathsByBucket.set(bucketId, inventory.objectPaths);
    truncated ||= inventory.truncated;
  }

  const total = (pick: (bucket: StorageInventoryBucket) => number) =>
    byBucket.reduce((sum, bucket) => sum + pick(bucket), 0);

  return {
    byBucket,
    objectPathsByBucket,
    unreferencedObjects: total((b) => b.unreferenced_objects),
    unreferencedScopedObjects: total((b) => b.unreferenced_scoped_objects),
    unreferencedUnscopedObjects: total((b) => b.unreferenced_unscoped_objects),
    truncated,
  };
}

async function loadOrganizationSets(admin: AdminClient) {
  const { data: organizations, error } = await admin
    .from("organizations")
    .select("id, is_active");
  if (error) throw new Error("No se pudieron resolver las organizaciones.");
  const rows = organizations ?? [];
  const isStringId = (id: unknown): id is string => typeof id === "string";
  return {
    knownOrganizationIds: new Set(rows.map((o) => o.id).filter(isStringId)),
    activeOrganizationIds: new Set(
      rows
        .filter((o) => (o as { is_active?: boolean }).is_active === true)
        .map((o) => o.id)
        .filter(isStringId),
    ),
  };
}

function recordBucketReferencePath(
  referencedPathsByBucket: Map<string, Set<string>>,
  bucketId: string,
  sourcePath: string | null,
): void {
  if (!sourcePath) return;
  const paths = referencedPathsByBucket.get(bucketId) ?? new Set();
  paths.add(sourcePath);
  referencedPathsByBucket.set(bucketId, paths);
}

function classifySpecRow(
  spec: ReferenceSpec,
  row: Record<string, unknown>,
  knownOrganizationIds: ReadonlySet<string>,
  counts: CandidateCounts,
  referencedPathsByBucket: Map<string, Set<string>>,
  candidates: CandidateReference[],
): void {
  counts.scanned++;
  const referenceId = typeof row.id === "string" ? row.id : "";
  const organizationId = typeof row.organization_id === "string"
    ? row.organization_id
    : "";
  if (!referenceId || !organizationId) {
    counts.missing_organization++;
    return;
  }

  const sourceValue = row[spec.column];
  const plan = makeStorageMigrationPlan(
    organizationId,
    spec.bucketId,
    sourceValue,
    knownOrganizationIds,
  );
  if (plan.disposition === "candidate") counts.candidates++;
  else counts[plan.disposition]++;

  recordBucketReferencePath(
    referencedPathsByBucket,
    spec.bucketId,
    plan.sourcePath,
  );

  if (plan.disposition !== "candidate" || typeof sourceValue !== "string") {
    return;
  }
  const { sourcePath, destinationPath, format } = plan;
  if (!sourcePath || !destinationPath || !format) return;

  candidates.push({
    spec,
    referenceId,
    organizationId,
    sourceValue,
    sourcePath,
    destinationPath,
    format,
    publicUrlOrigin: plan.publicUrlOrigin,
  });
}

function filterCrossOrgConflicts(
  candidates: CandidateReference[],
  counts: CandidateCounts,
): CandidateReference[] {
  const ownerBySource = new Map<string, string>();
  const conflictedSources = new Set<string>();
  for (const candidate of candidates) {
    const key = `${candidate.spec.bucketId}/${candidate.sourcePath}`;
    const previous = ownerBySource.get(key);
    if (previous && previous !== candidate.organizationId) {
      conflictedSources.add(key);
    }
    ownerBySource.set(key, candidate.organizationId);
  }
  if (conflictedSources.size === 0) return candidates;

  const safeCandidates = candidates.filter(
    (c) => !conflictedSources.has(`${c.spec.bucketId}/${c.sourcePath}`),
  );
  const removed = candidates.length - safeCandidates.length;
  counts.belongs_to_other_organization += removed;
  counts.candidates -= removed;
  return safeCandidates;
}

export async function collectCandidates(
  admin: AdminClient,
  maxRowsPerReference: number,
) {
  const candidates: CandidateReference[] = [];
  const referencedPathsByBucket = new Map<string, Set<string>>();
  const counts = emptyCounts();
  let truncated = false;
  const { knownOrganizationIds, activeOrganizationIds } =
    await loadOrganizationSets(admin);

  for (const spec of REFERENCE_SPECS) {
    const { data, error } = await admin
      .from(spec.table)
      .select(`id, organization_id, ${spec.column}`)
      .not(spec.column, "is", null)
      .limit(maxRowsPerReference);
    if (error) throw new Error(`No se pudo leer ${spec.table}.`);

    const rows = (data ?? []) as Array<Record<string, unknown>>;
    if (rows.length === maxRowsPerReference) truncated = true;
    for (const row of rows) {
      classifySpecRow(
        spec,
        row,
        knownOrganizationIds,
        counts,
        referencedPathsByBucket,
        candidates,
      );
    }
  }

  return {
    candidates: filterCrossOrgConflicts(candidates, counts),
    counts,
    referencedPathsByBucket,
    organizationIds: [...knownOrganizationIds],
    activeOrganizationIds: [...activeOrganizationIds],
    truncated,
  };
}
