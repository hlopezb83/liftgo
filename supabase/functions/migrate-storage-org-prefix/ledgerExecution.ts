import { deleteEligibility } from "../_shared/storageDeletePhase.ts";
import { destinationReferenceValue } from "../_shared/storageMigrationPlan.ts";
import {
  filterOrphanLedgerToApproved,
  makeApprovedOrphanKeySet,
} from "../_shared/storageQuarantine.ts";
import {
  applyBatch,
  ensureCopied,
  ensureLedger,
  updateObject,
} from "./ledgerCopyAndUpdate.ts";
import { storagePathExists, verifyCopyIntegrity } from "./orphanResolution.ts";
import type {
  AdminClient,
  LedgerObject,
  LedgerReference,
  OrphanCandidate,
} from "./specsAndTypes.ts";

export { applyBatch, ensureLedger };

const ORPHAN_LEDGER_PAGE_SIZE = 500;
const ORPHAN_LEDGER_MAX_SCANNED = 20_000;

export async function ensureOrphanLedger(
  admin: AdminClient,
  candidates: OrphanCandidate[],
): Promise<void> {
  for (const candidate of candidates) {
    const { data: existing, error: findError } = await admin
      .from("storage_object_migrations")
      .select("id, discovery_kind")
      .eq("bucket_id", candidate.bucketId)
      .eq("source_path", candidate.sourcePath)
      .maybeSingle();
    if (findError) {
      throw new Error("No se pudo consultar el ledger de huérfanos.");
    }

    if (existing?.id) {
      if (existing.discovery_kind !== "orphaned") {
        throw new Error(
          "El objeto huérfano ya tiene una migración incompatible.",
        );
      }
      continue;
    }

    const { error: insertError } = await admin
      .from("storage_object_migrations")
      .insert({
        bucket_id: candidate.bucketId,
        organization_id: candidate.organizationId,
        source_path: candidate.sourcePath,
        destination_path: candidate.destinationPath,
        discovery_kind: "orphaned",
      });
    if (insertError) {
      throw new Error("No se pudo crear el ledger de huérfanos.");
    }
  }
}

export async function applyOrphanBatch(
  admin: AdminClient,
  batchSize: number,
  approved: readonly OrphanCandidate[],
): Promise<Record<string, number>> {
  const approvedKeys = makeApprovedOrphanKeySet(
    approved.map((candidate) => ({
      bucketId: candidate.bucketId,
      sourcePath: candidate.sourcePath,
      organizationId: candidate.organizationId,
    })),
  );
  if (approvedKeys.size === 0) return { copied: 0, failed: 0, skipped: 0 };

  const collected: LedgerObject[] = [];
  let skipped = 0;
  let offset = 0;
  for (;;) {
    const { data: rows, error } = await admin
      .from("storage_object_migrations")
      .select(
        "id, bucket_id, organization_id, source_path, destination_path, discovery_kind, status, attempt_count",
      )
      .eq("discovery_kind", "orphaned")
      .in("status", ["planned", "failed"])
      .order("created_at", { ascending: true })
      .range(offset, offset + ORPHAN_LEDGER_PAGE_SIZE - 1);
    if (error) throw new Error("No se pudo leer el lote de huérfanos.");
    const page = (rows ?? []) as LedgerObject[];

    const { allowed, skipped: pageSkipped } = filterOrphanLedgerToApproved(
      page,
      approvedKeys,
    );
    skipped += pageSkipped;
    for (const object of allowed) {
      if (collected.length < batchSize) collected.push(object);
      else skipped++;
    }

    offset += page.length;
    if (page.length < ORPHAN_LEDGER_PAGE_SIZE) break;
    if (collected.length >= batchSize) break;
    if (offset >= ORPHAN_LEDGER_MAX_SCANNED) {
      throw new Error(
        "Se alcanzó el límite de exploración del ledger de huérfanos.",
      );
    }
  }

  const outcomes = { copied: 0, failed: 0, skipped };
  for (const object of collected) {
    outcomes[await ensureCopied(admin, object)]++;
  }
  return outcomes;
}

async function collectDeleteReferenceChecks(
  admin: AdminClient,
  object: LedgerObject,
  references: LedgerReference[],
) {
  const checks = [];
  for (const reference of references) {
    const expectedValue = destinationReferenceValue(
      object.bucket_id,
      object.destination_path,
      reference.value_format,
      reference.public_url_origin,
    );
    const { data, error } = await admin
      .from(reference.reference_table)
      .select(`organization_id, ${reference.reference_column}`)
      .eq("id", reference.reference_id)
      .maybeSingle();
    const row = (error ? null : data) as Record<string, unknown> | null;
    const currentValue = row?.[reference.reference_column];
    checks.push({
      status: reference.status,
      organizationId: typeof row?.organization_id === "string"
        ? row.organization_id
        : null,
      currentValue: typeof currentValue === "string" ? currentValue : null,
      expectedValue,
    });
  }
  return checks;
}

async function deleteSourceObject(
  admin: AdminClient,
  object: LedgerObject,
  references: LedgerReference[],
): Promise<"source_deleted" | "blocked" | "failed"> {
  const destinationExists = await storagePathExists(
    admin,
    object.bucket_id,
    object.destination_path,
  );
  const checks = await collectDeleteReferenceChecks(admin, object, references);
  const eligibility = deleteEligibility(object, checks, destinationExists);
  if (eligibility === "already_deleted") return "source_deleted";
  if (eligibility !== "eligible") {
    await updateObject(admin, object.id, { last_error_code: eligibility });
    return "blocked";
  }

  const sourceStillExists = await storagePathExists(
    admin,
    object.bucket_id,
    object.source_path,
  );
  if (sourceStillExists) {
    const verdict = await verifyCopyIntegrity(admin, object);
    if (verdict !== "verified") {
      await updateObject(admin, object.id, { last_error_code: verdict });
      return "blocked";
    }

    const { error } = await admin.storage.from(object.bucket_id).remove([
      object.source_path,
    ]);
    if (error) {
      await updateObject(admin, object.id, {
        last_error_code: "storage_delete_failed",
      });
      return "failed";
    }
  }

  await updateObject(admin, object.id, {
    status: "source_deleted",
    source_deleted_at: new Date().toISOString(),
    last_error_code: null,
  });
  return "source_deleted";
}

export async function deleteSourcesBatch(
  admin: AdminClient,
  batchSize: number,
): Promise<Record<string, number>> {
  const { data: rows, error } = await admin
    .from("storage_object_migrations")
    .select(
      "id, bucket_id, organization_id, source_path, destination_path, discovery_kind, status, attempt_count",
    )
    .eq("discovery_kind", "referenced")
    .eq("status", "references_updated")
    .order("created_at", { ascending: true })
    .limit(batchSize);
  if (error) throw new Error("No se pudo leer el lote de borrado.");

  const objects = (rows ?? []) as LedgerObject[];
  const outcomes = { source_deleted: 0, blocked: 0, failed: 0 };
  if (objects.length === 0) return outcomes;

  const { data: refs, error: refsError } = await admin
    .from("storage_reference_migrations")
    .select(
      "id, migration_id, reference_table, reference_id, reference_column, source_value_sha256, value_format, public_url_origin, status",
    )
    .in("migration_id", objects.map((object) => object.id));
  if (refsError) {
    throw new Error("No se pudieron leer las referencias del lote de borrado.");
  }

  const refsByObject = new Map<string, LedgerReference[]>();
  for (const reference of (refs ?? []) as LedgerReference[]) {
    const list = refsByObject.get(reference.migration_id) ?? [];
    list.push(reference);
    refsByObject.set(reference.migration_id, list);
  }

  for (const object of objects) {
    outcomes[
      await deleteSourceObject(
        admin,
        object,
        refsByObject.get(object.id) ?? [],
      )
    ]++;
  }
  return outcomes;
}
