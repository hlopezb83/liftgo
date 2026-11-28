import { destinationReferenceValue } from "../_shared/storageMigrationPlan.ts";
import {
  type AdminClient,
  type CandidateReference,
  type LedgerObject,
  type LedgerReference,
  sha256,
  specForReference,
} from "./specsAndTypes.ts";
import { storagePathExists, verifyCopyIntegrity } from "./storageIntegrity.ts";

const REFERENCED_PENDING_STATUSES = ["planned", "copied", "failed"] as const;

export async function updateObject(
  admin: AdminClient,
  id: string,
  patch: Record<string, unknown>,
): Promise<void> {
  const { error } = await admin
    .from("storage_object_migrations")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error("No se pudo actualizar el ledger de objetos.");
}

async function updateReference(
  admin: AdminClient,
  id: string,
  patch: Record<string, unknown>,
): Promise<void> {
  const { error } = await admin
    .from("storage_reference_migrations")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error("No se pudo actualizar el ledger de referencias.");
}

async function resolveOrInsertObjectMigrationId(
  admin: AdminClient,
  candidate: CandidateReference,
): Promise<string> {
  const { data: existing, error: findError } = await admin
    .from("storage_object_migrations")
    .select("id")
    .eq("bucket_id", candidate.spec.bucketId)
    .eq("source_path", candidate.sourcePath)
    .maybeSingle();
  if (findError) throw new Error("No se pudo consultar el ledger de objetos.");
  if (existing?.id) return existing.id as string;

  const { data: inserted, error: insertError } = await admin
    .from("storage_object_migrations")
    .insert({
      bucket_id: candidate.spec.bucketId,
      organization_id: candidate.organizationId,
      source_path: candidate.sourcePath,
      destination_path: candidate.destinationPath,
    })
    .select("id")
    .single();
  if (insertError || !inserted?.id) {
    throw new Error("No se pudo crear el ledger de objetos.");
  }
  return inserted.id as string;
}

export async function ensureLedger(
  admin: AdminClient,
  candidates: CandidateReference[],
): Promise<void> {
  const objectIds = new Map<string, string>();
  for (const candidate of candidates) {
    const key = `${candidate.spec.bucketId}/${candidate.sourcePath}`;
    let migrationId = objectIds.get(key);
    if (!migrationId) {
      migrationId = await resolveOrInsertObjectMigrationId(admin, candidate);
      objectIds.set(key, migrationId);
    }

    const { error: referenceError } = await admin
      .from("storage_reference_migrations")
      .upsert(
        {
          migration_id: migrationId,
          reference_table: candidate.spec.table,
          reference_id: candidate.referenceId,
          reference_column: candidate.spec.column,
          source_value_sha256: await sha256(candidate.sourceValue),
          value_format: candidate.format,
          public_url_origin: candidate.publicUrlOrigin,
        },
        {
          onConflict:
            "migration_id,reference_table,reference_id,reference_column",
          ignoreDuplicates: true,
        },
      );
    if (referenceError) {
      throw new Error("No se pudo crear el ledger de referencias.");
    }
  }
}

export async function ensureCopied(
  admin: AdminClient,
  object: LedgerObject,
): Promise<"copied" | "failed"> {
  const destinationExists = await storagePathExists(
    admin,
    object.bucket_id,
    object.destination_path,
  );
  if (!destinationExists) {
    const sourceExists = await storagePathExists(
      admin,
      object.bucket_id,
      object.source_path,
    );
    if (!sourceExists) {
      await updateObject(admin, object.id, {
        status: "failed",
        last_error_code: "source_missing",
        attempt_count: object.attempt_count + 1,
      });
      return "failed";
    }
    const { error } = await admin.storage
      .from(object.bucket_id)
      .copy(object.source_path, object.destination_path);
    if (error) {
      await updateObject(admin, object.id, {
        status: "failed",
        last_error_code: "storage_copy_failed",
        attempt_count: object.attempt_count + 1,
      });
      return "failed";
    }
  }

  const verdict = await verifyCopyIntegrity(admin, object);
  if (verdict !== "verified") {
    await updateObject(admin, object.id, {
      status: "failed",
      last_error_code: verdict,
      attempt_count: object.attempt_count + 1,
    });
    return "failed";
  }

  if (object.status === "copied" || object.status === "references_updated") {
    return "copied";
  }

  await updateObject(admin, object.id, {
    status: "copied",
    copied_at: new Date().toISOString(),
    last_error_code: null,
    attempt_count: object.attempt_count + 1,
  });
  return "copied";
}

async function failRef(
  admin: AdminClient,
  refId: string,
  code: string,
): Promise<false> {
  await updateReference(admin, refId, {
    status: "failed",
    last_error_code: code,
  });
  return false;
}

async function updateOneReference(
  admin: AdminClient,
  object: LedgerObject,
  reference: LedgerReference,
): Promise<boolean> {
  const spec = specForReference(
    reference.reference_table,
    reference.reference_column,
  );
  if (!spec || spec.bucketId !== object.bucket_id) {
    return await failRef(admin, reference.id, "invalid_ledger_reference");
  }

  const destinationValue = destinationReferenceValue(
    object.bucket_id,
    object.destination_path,
    reference.value_format,
    reference.public_url_origin,
  );
  if (!destinationValue) {
    return await failRef(admin, reference.id, "destination_value_invalid");
  }

  const { data: current, error: readError } = await admin
    .from(reference.reference_table)
    .select(`organization_id, ${reference.reference_column}`)
    .eq("id", reference.reference_id)
    .maybeSingle();
  if (readError || !current) {
    return await failRef(admin, reference.id, "reference_missing");
  }

  const row = current as unknown as Record<string, unknown>;
  if (row.organization_id !== object.organization_id) {
    return await failRef(
      admin,
      reference.id,
      "reference_organization_mismatch",
    );
  }

  const currentValue = row[reference.reference_column];
  if (typeof currentValue !== "string") {
    return await failRef(admin, reference.id, "reference_value_missing");
  }

  if (currentValue === destinationValue) {
    await updateReference(admin, reference.id, {
      status: "updated",
      last_error_code: null,
    });
    return true;
  }

  if ((await sha256(currentValue)) !== reference.source_value_sha256) {
    return await failRef(admin, reference.id, "reference_changed");
  }

  const { data: updated, error: updateError } = await admin
    .from(reference.reference_table)
    .update({ [reference.reference_column]: destinationValue })
    .eq("id", reference.reference_id)
    .eq("organization_id", object.organization_id)
    .eq(reference.reference_column, currentValue)
    .select(reference.reference_column)
    .maybeSingle();

  if (updateError || !updated) {
    return await failRef(admin, reference.id, "reference_update_conflict");
  }

  await updateReference(admin, reference.id, {
    status: "updated",
    last_error_code: null,
  });
  return true;
}

async function processObject(
  admin: AdminClient,
  object: LedgerObject,
  references: LedgerReference[],
): Promise<"references_updated" | "pending" | "failed"> {
  if (
    object.status === "references_updated" ||
    object.status === "source_deleted"
  ) {
    return "references_updated";
  }
  if ((await ensureCopied(admin, object)) === "failed") return "failed";

  let allUpdated = references.length > 0;
  for (const reference of references) {
    if (!(await updateOneReference(admin, object, reference))) {
      allUpdated = false;
    }
  }
  if (!allUpdated) return "pending";

  await updateObject(admin, object.id, {
    status: "references_updated",
    references_updated_at: new Date().toISOString(),
    last_error_code: null,
  });
  return "references_updated";
}

export async function applyBatch(
  admin: AdminClient,
  batchSize: number,
): Promise<Record<string, number>> {
  const { data: rows, error } = await admin
    .from("storage_object_migrations")
    .select(
      "id, bucket_id, organization_id, source_path, destination_path, discovery_kind, status, attempt_count",
    )
    .eq("discovery_kind", "referenced")
    .in("status", REFERENCED_PENDING_STATUSES)
    .order("created_at", { ascending: true })
    .limit(batchSize);
  if (error) throw new Error("No se pudo leer el lote pendiente.");

  const objects = (rows ?? []) as LedgerObject[];
  if (objects.length === 0) {
    return { references_updated: 0, pending: 0, failed: 0 };
  }

  const { data: refs, error: refsError } = await admin
    .from("storage_reference_migrations")
    .select(
      "id, migration_id, reference_table, reference_id, reference_column, source_value_sha256, value_format, public_url_origin, status",
    )
    .in("migration_id", objects.map((o) => o.id));
  if (refsError) {
    throw new Error("No se pudieron leer las referencias pendientes.");
  }

  const refsByObject = new Map<string, LedgerReference[]>();
  for (const ref of (refs ?? []) as LedgerReference[]) {
    const list = refsByObject.get(ref.migration_id) ?? [];
    list.push(ref);
    refsByObject.set(ref.migration_id, list);
  }

  const outcomes = { references_updated: 0, pending: 0, failed: 0 };
  for (const object of objects) {
    outcomes[
      await processObject(admin, object, refsByObject.get(object.id) ?? [])
    ]++;
  }
  return outcomes;
}
