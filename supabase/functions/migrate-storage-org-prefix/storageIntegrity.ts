import {
  compareCopy,
  type CopyVerdict,
  digestBytes,
  type ObjectDigest,
} from "../_shared/storageCopyVerification.ts";
import type { OrphanLedgerRecord } from "../_shared/storageOrphanReconciliation.ts";
import type { ManualResolutionRecord } from "../_shared/storageQuarantine.ts";
import type { AdminClient, LedgerObject } from "./specsAndTypes.ts";

export async function storagePathExists(
  admin: AdminClient,
  bucketId: string,
  path: string,
): Promise<boolean> {
  const slash = path.lastIndexOf("/");
  const folder = slash > -1 ? path.slice(0, slash) : "";
  const name = slash > -1 ? path.slice(slash + 1) : path;
  const { data, error } = await admin.storage.from(bucketId).list(folder, {
    limit: 1_000,
    offset: 0,
  });
  if (error) return false;
  return (data ?? []).some((item) => item.name === name);
}

async function objectDigest(
  admin: AdminClient,
  bucketId: string,
  path: string,
): Promise<ObjectDigest | null> {
  const { data, error } = await admin.storage.from(bucketId).download(path);
  if (error || !data) return null;
  try {
    return await digestBytes(new Uint8Array(await data.arrayBuffer()));
  } catch {
    return null;
  }
}

export async function verifyCopyIntegrity(
  admin: AdminClient,
  object: LedgerObject,
): Promise<CopyVerdict> {
  const [source, destination] = await Promise.all([
    objectDigest(admin, object.bucket_id, object.source_path),
    objectDigest(admin, object.bucket_id, object.destination_path),
  ]);
  return compareCopy(source, destination);
}

export async function loadManualResolutions(
  admin: AdminClient,
  unreferencedUnscoped: Array<{ bucketId: string; sourcePath: string }>,
): Promise<Map<string, ManualResolutionRecord>> {
  const result = new Map<string, ManualResolutionRecord>();
  if (unreferencedUnscoped.length === 0) return result;

  const paths = [
    ...new Set(unreferencedUnscoped.map((entry) => entry.sourcePath)),
  ];
  const chunkSize = 50;
  for (let index = 0; index < paths.length; index += chunkSize) {
    const chunk = paths.slice(index, index + chunkSize);
    const { data, error } = await admin
      .from("storage_migration_manual_resolutions")
      .select(
        "bucket_id, source_path, organization_id, resolved_by, justification, revalidated_at, status",
      )
      .eq("status", "active")
      .in("source_path", chunk);
    if (error || !data) return new Map();

    for (const row of data as ManualResolutionRecord[]) {
      result.set(`${row.bucket_id}\n${row.source_path}`, row);
    }
  }
  return result;
}

export async function loadOrphanLedgerRecords(
  admin: AdminClient,
  objects: Array<{ bucketId: string; sourcePath: string }>,
): Promise<OrphanLedgerRecord[]> {
  if (objects.length === 0) return [];
  const paths = [...new Set(objects.map((entry) => entry.sourcePath))];
  const records: OrphanLedgerRecord[] = [];
  const chunkSize = 100;

  for (let index = 0; index < paths.length; index += chunkSize) {
    const chunk = paths.slice(index, index + chunkSize);
    const { data, error } = await admin
      .from("storage_object_migrations")
      .select(
        "bucket_id, source_path, organization_id, destination_path, discovery_kind, status",
      )
      .in("source_path", chunk);
    if (error || !data) return [];
    records.push(...(data as OrphanLedgerRecord[]));
  }
  return records;
}
