// Migración administrativa y reanudable de Storage a <organization_id>/<path>.
//
// El endpoint no expone rutas ni URLs: sólo agrega contadores. El modo apply
// requiere tres barreras independientes: auth cron/service, secreto de entorno
// y confirmación textual. El orden del modo apply es:
//   inventariar → copiar → comparar tamaño y SHA-256 fuente/copia →
//   actualizar referencias.
// Apply NUNCA borra la fuente. El borrado es la fase posterior `delete_sources`,
// con bandera de entorno propia (apagada por defecto), confirmación textual
// distinta y, objeto por objeto, revalidación de referencias y de la igualdad
// de bytes fuente/copia inmediatamente antes de remover.
// Los objetos huérfanos nunca se borran por ninguna vía.

import { handleCors } from "../_shared/cors.ts";
import { authenticateCronRequest } from "../_shared/cronAuth.ts";
import { jsonResponse } from "../_shared/http.ts";
import {
  destinationReferenceValue,
  makeStorageMigrationPlan,
  type StorageReferenceFormat,
} from "../_shared/storageMigrationPlan.ts";
import {
  partitionStorageList,
  type StorageInventoryBucket,
  type StorageListItem,
  summarizeStorageInventory,
} from "../_shared/storageInventory.ts";
import {
  hasOrganizationStoragePrefix,
  organizationStoragePath,
} from "../_shared/storagePath.ts";
import {
  compareCopy,
  type CopyVerdict,
  digestBytes,
  type ObjectDigest,
} from "../_shared/storageCopyVerification.ts";
import {
  DELETE_ENV_FLAG,
  deleteEligibility,
  deleteGateDecision,
} from "../_shared/storageDeletePhase.ts";
import {
  buildOrphanOwnerIndex,
  collectOrphanOwnerLookupKeys,
  type OrphanOwnerIndex,
  type OrphanOwnerResolution,
  type OrphanOwnerResolutionMethod,
  resolveOrphanOwner,
  summarizeOrphanOwnership,
} from "../_shared/storageOrphanOwner.ts";
import {
  evaluateManualResolution,
  type ManualResolutionRecord,
  summarizeQuarantine,
} from "../_shared/storageQuarantine.ts";

import { getAdminClient } from "../_shared/supabaseClients.ts";

const APPLY_CONFIRMATION = "COPY_UPDATE_VERIFY_NO_DELETE";
const ORPHAN_APPLY_CONFIRMATION = "COPY_VERIFY_ORPHANS_NO_DELETE";
const APPLY_ENV_FLAG = "STORAGE_MIGRATION_APPLY_ENABLED";
const DEFAULT_MAX_ROWS_PER_REFERENCE = 250;
const MAX_ROWS_PER_REFERENCE = 1_000;
const DEFAULT_BATCH_SIZE = 25;
const MAX_BATCH_SIZE = 100;
const DEFAULT_MAX_OBJECTS_PER_BUCKET = 1_000;
const MAX_OBJECTS_PER_BUCKET = 10_000;
const MAX_PREFIXES_PER_BUCKET = 2_000;

const REFERENCE_SPECS = [
  { table: "company_settings", column: "logo_url", bucketId: "documents" },
  { table: "documents", column: "file_url", bucketId: "documents" },
  {
    table: "feedback_reports",
    column: "screenshot_url",
    bucketId: "feedback-screenshots",
  },
  {
    table: "customer_payment_intents",
    column: "proof_url",
    bucketId: "payment-proofs",
  },
  { table: "invoices", column: "cfdi_xml_url", bucketId: "cfdi-files" },
  { table: "invoices", column: "cfdi_pdf_url", bucketId: "cfdi-files" },
  { table: "invoices", column: "acuse_xml_url", bucketId: "cfdi-files" },
  { table: "invoices", column: "acuse_pdf_url", bucketId: "cfdi-files" },
  {
    table: "credit_notes",
    column: "cfdi_xml_url",
    bucketId: "cfdi-files",
  },
  {
    table: "credit_notes",
    column: "cfdi_pdf_url",
    bucketId: "cfdi-files",
  },
  { table: "payments", column: "rep_xml_url", bucketId: "cfdi-files" },
  { table: "payments", column: "rep_pdf_url", bucketId: "cfdi-files" },
  {
    table: "supplier_bills",
    column: "cfdi_xml_url",
    bucketId: "supplier-bill-cfdi-xml",
  },
  {
    table: "supplier_payments",
    column: "receipt_url",
    bucketId: "supplier-payment-receipts",
  },
  {
    table: "supplier_payments",
    column: "rep_xml_url",
    bucketId: "cfdi-files",
  },
  {
    table: "supplier_payments",
    column: "rep_pdf_url",
    bucketId: "cfdi-files",
  },
] as const;

type ReferenceSpec = (typeof REFERENCE_SPECS)[number];
type AdminClient = ReturnType<typeof getAdminClient>;

interface CandidateReference {
  spec: ReferenceSpec;
  referenceId: string;
  organizationId: string;
  sourceValue: string;
  sourcePath: string;
  destinationPath: string;
  format: StorageReferenceFormat;
  publicUrlOrigin: string | null;
}

interface OrphanCandidate {
  bucketId: string;
  organizationId: string;
  sourcePath: string;
  destinationPath: string;
  /**
   * Método determinista con que se atribuyó el dueño. No se persiste una
   * columna nueva en el ledger: el método queda determinado por `bucket_id`
   * (ver docs/multiempresa/storage-historico.md), así que una columna
   * `owner_resolution_method` sería redundante y obligaría a guardar
   * evidencia derivada del UUID fiscal.
   */
  ownerResolutionMethod: OrphanOwnerResolutionMethod | "manual_resolution";
}

interface LedgerObject {
  id: string;
  bucket_id: string;
  organization_id: string;
  source_path: string;
  destination_path: string;
  discovery_kind: "referenced" | "orphaned";
  status: string;
  attempt_count: number;
}

interface LedgerReference {
  id: string;
  migration_id: string;
  reference_table: string;
  reference_id: string;
  reference_column: string;
  source_value_sha256: string;
  value_format: StorageReferenceFormat;
  public_url_origin: string | null;
  status: string;
}

interface RequestInput {
  mode: "plan" | "apply" | "apply_orphans" | "delete_sources";
  maxRowsPerReference: number;
  maxObjectsPerBucket: number;
  batchSize: number;
  confirmation: string | null;
}

function boundedInteger(
  value: unknown,
  fallback: number,
  maximum: number,
): number {
  if (typeof value !== "number" || !Number.isInteger(value)) return fallback;
  return Math.max(1, Math.min(value, maximum));
}

async function parseInput(req: Request): Promise<RequestInput | null> {
  let body: Record<string, unknown> = {};
  try {
    body = await req.json() as Record<string, unknown>;
  } catch {
    if (req.method !== "POST") return null;
  }

  const mode = body.mode === undefined ? "plan" : body.mode;
  if (
    mode !== "plan" &&
    mode !== "apply" &&
    mode !== "apply_orphans" &&
    mode !== "delete_sources"
  ) return null;
  return {
    mode,
    maxRowsPerReference: boundedInteger(
      body.max_rows_per_reference,
      DEFAULT_MAX_ROWS_PER_REFERENCE,
      MAX_ROWS_PER_REFERENCE,
    ),
    maxObjectsPerBucket: boundedInteger(
      body.max_objects_per_bucket,
      DEFAULT_MAX_OBJECTS_PER_BUCKET,
      MAX_OBJECTS_PER_BUCKET,
    ),
    batchSize: boundedInteger(
      body.batch_size,
      DEFAULT_BATCH_SIZE,
      MAX_BATCH_SIZE,
    ),
    confirmation: typeof body.confirmation === "string"
      ? body.confirmation
      : null,
  };
}

async function sha256(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((part) => part.toString(16).padStart(2, "0"))
    .join("");
}

function emptyCounts() {
  return {
    scanned: 0,
    candidates: 0,
    already_scoped: 0,
    belongs_to_other_organization: 0,
    unsupported: 0,
    missing_organization: 0,
  };
}

function countByBucket(
  candidates: CandidateReference[],
): Array<{ bucket: string; references: number; objects: number }> {
  const grouped = new Map<
    string,
    { references: number; objects: Set<string> }
  >();
  for (const candidate of candidates) {
    const entry = grouped.get(candidate.spec.bucketId) ?? {
      references: 0,
      objects: new Set<string>(),
    };
    entry.references++;
    entry.objects.add(candidate.sourcePath);
    grouped.set(candidate.spec.bucketId, entry);
  }
  return [...grouped.entries()]
    .map(([bucket, entry]) => ({
      bucket,
      references: entry.references,
      objects: entry.objects.size,
    }))
    .sort((left, right) => left.bucket.localeCompare(right.bucket));
}

function storageBucketIds(): string[] {
  return [...new Set(REFERENCE_SPECS.map((spec) => spec.bucketId))]
    .sort((left, right) => left.localeCompare(right));
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
  const objectPaths = new Set<string>();
  const pendingPrefixes = [""];
  const scheduledPrefixes = new Set(pendingPrefixes);
  const visitedPrefixes = new Set<string>();
  let truncated = false;

  while (pendingPrefixes.length > 0 && !truncated) {
    const prefix = pendingPrefixes.shift()!;
    if (visitedPrefixes.has(prefix)) continue;
    visitedPrefixes.add(prefix);
    if (visitedPrefixes.size > MAX_PREFIXES_PER_BUCKET) {
      truncated = true;
      break;
    }

    let offset = 0;
    for (;;) {
      const { data, error } = await admin.storage.from(bucketId).list(prefix, {
        limit: 1_000,
        offset,
      });
      if (error) {
        throw new Error("No se pudo inventariar el bucket de Storage.");
      }

      const rows = (data ?? []) as StorageListItem[];
      const partition = partitionStorageList(prefix, rows);
      for (const folder of partition.folders) {
        if (!scheduledPrefixes.has(folder)) {
          scheduledPrefixes.add(folder);
          pendingPrefixes.push(folder);
        }
      }

      for (const path of partition.objectPaths) {
        const sizeBefore = objectPaths.size;
        objectPaths.add(path);
        if (objectPaths.size > maxObjects) {
          if (objectPaths.size > sizeBefore) objectPaths.delete(path);
          truncated = true;
          break;
        }
      }
      if (truncated || rows.length < 1_000) break;
      offset += rows.length;
    }
  }

  return {
    summary: summarizeStorageInventory(
      bucketId,
      objectPaths,
      referencedPaths,
      organizationIds,
    ),
    objectPaths,
    truncated,
  };
}

async function collectStorageInventory(
  admin: AdminClient,
  referencedPathsByBucket: Map<string, Set<string>>,
  maxObjectsPerBucket: number,
  organizationIds: string[] = [],
): Promise<{
  byBucket: Array<ReturnType<typeof summarizeStorageInventory>>;
  objectPathsByBucket: Map<string, Set<string>>;
  unreferencedObjects: number;
  unreferencedScopedObjects: number;
  unreferencedUnscopedObjects: number;
  truncated: boolean;
}> {
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
    unreferencedObjects: total((bucket) => bucket.unreferenced_objects),
    unreferencedScopedObjects: total((bucket) =>
      bucket.unreferenced_scoped_objects
    ),
    unreferencedUnscopedObjects: total((bucket) =>
      bucket.unreferenced_unscoped_objects
    ),
    truncated,
  };
}

async function collectCandidates(
  admin: AdminClient,
  maxRowsPerReference: number,
): Promise<{
  candidates: CandidateReference[];
  counts: ReturnType<typeof emptyCounts>;
  referencedPathsByBucket: Map<string, Set<string>>;
  organizationIds: string[];
  activeOrganizationIds: string[];
  truncated: boolean;
}> {
  const candidates: CandidateReference[] = [];
  const referencedPathsByBucket = new Map<string, Set<string>>();
  const counts = emptyCounts();
  let truncated = false;

  const { data: organizations, error: organizationsError } = await admin
    .from("organizations")
    .select("id, is_active");
  if (organizationsError) {
    throw new Error("No se pudieron resolver las organizaciones.");
  }
  const knownOrganizationIds = new Set(
    (organizations ?? [])
      .map((organization) => organization.id)
      .filter((id): id is string => typeof id === "string"),
  );
  const activeOrganizationIds = new Set(
    (organizations ?? [])
      .filter((organization) =>
        (organization as { is_active?: boolean }).is_active === true
      )
      .map((organization) => organization.id)
      .filter((id): id is string => typeof id === "string"),
  );

  for (const spec of REFERENCE_SPECS) {
    const { data, error } = await admin
      .from(spec.table)
      .select(`id, organization_id, ${spec.column}`)
      .not(spec.column, "is", null)
      .limit(maxRowsPerReference);

    if (error) {
      throw new Error(`No se pudo leer ${spec.table}.`);
    }
    const rows = (data ?? []) as Array<Record<string, unknown>>;
    if (rows.length === maxRowsPerReference) truncated = true;

    for (const row of rows) {
      counts.scanned++;
      const referenceId = typeof row.id === "string" ? row.id : "";
      const organizationId = typeof row.organization_id === "string"
        ? row.organization_id
        : "";
      const sourceValue = row[spec.column];

      if (!referenceId || !organizationId) {
        counts.missing_organization++;
        continue;
      }

      const plan = makeStorageMigrationPlan(
        organizationId,
        spec.bucketId,
        sourceValue,
        knownOrganizationIds,
      );
      if (plan.disposition === "candidate") counts.candidates++;
      else counts[plan.disposition]++;

      // Conserva únicamente rutas internas y normalizadas. No se devuelve ni
      // persiste este inventario: se usa para detectar objetos sin referencia.
      if (plan.sourcePath) {
        const paths = referencedPathsByBucket.get(spec.bucketId) ?? new Set();
        paths.add(plan.sourcePath);
        referencedPathsByBucket.set(spec.bucketId, paths);
      }

      if (
        plan.disposition !== "candidate" ||
        typeof sourceValue !== "string" ||
        !plan.sourcePath ||
        !plan.destinationPath ||
        !plan.format
      ) {
        continue;
      }

      candidates.push({
        spec,
        referenceId,
        organizationId,
        sourceValue,
        sourcePath: plan.sourcePath,
        destinationPath: plan.destinationPath,
        format: plan.format,
        publicUrlOrigin: plan.publicUrlOrigin,
      });
    }
  }

  // Una misma ruta no puede pertenecer simultáneamente a dos organizaciones.
  // No se persiste ni se toca hasta resolver manualmente esa inconsistencia.
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
  if (conflictedSources.size > 0) {
    const safeCandidates = candidates.filter((candidate) => {
      const key = `${candidate.spec.bucketId}/${candidate.sourcePath}`;
      return !conflictedSources.has(key);
    });
    counts.belongs_to_other_organization += candidates.length -
      safeCandidates.length;
    counts.candidates -= candidates.length - safeCandidates.length;
    return {
      candidates: safeCandidates,
      counts,
      referencedPathsByBucket,
      organizationIds: [...knownOrganizationIds],
      activeOrganizationIds: [...activeOrganizationIds],
      truncated,
    };
  }

  return {
    candidates,
    counts,
    referencedPathsByBucket,
    organizationIds: [...knownOrganizationIds],
    activeOrganizationIds: [...activeOrganizationIds],
    truncated,
  };
}

const OWNER_LOOKUP_CHUNK = 100;
const OWNER_LOOKUP_PAGE = 500;
/** Cota dura de filas por clave: más que esto es duplicado patológico. */
const OWNER_LOOKUP_MAX_ROWS_PER_KEY = 50;

/**
 * Lee sólo las filas dueñas que coinciden exactamente con las claves de los
 * huérfanos, con filtros estructurados (nunca interpolación SQL ni regex) y
 * paginación hasta agotar resultados.
 *
 * `supplier_bills.cfdi_uuid` es `text` y en producción convive en mayúsculas y
 * minúsculas, mientras que la clave del path se normaliza a minúsculas. Para no
 * producir falsos negativos la búsqueda es exacta pero insensible a
 * mayúsculas: `ilike` SIN comodines, aplicado sólo a claves ya validadas como
 * UUID (no pueden contener `%`, `_`, `,` ni comillas). `supplier_bills.id` es
 * `uuid` y conserva el filtro exacto `.in(...)`.
 *
 * Fail-closed: una clave cuya lectura no se pudo agotar (página incompleta,
 * error o cota alcanzada) NO se marca como completa, así que resolverá
 * `incomplete_lookup` y nunca producirá un candidato para el ledger.
 */
function isLookupKey(value: unknown): value is string {
  return typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
      .test(value);
}

async function loadOrphanOwnerIndex(
  admin: AdminClient,
  keys: { cfdiUuid: string[]; id: string[] },
): Promise<OrphanOwnerIndex> {
  const rows: Array<
    { id?: unknown; cfdiUuid?: unknown; organizationId?: unknown }
  > = [];
  const completeCfdiUuid: string[] = [];
  const completeId: string[] = [];

  async function readColumn(
    column: "cfdi_uuid" | "id",
    values: string[],
    complete: string[],
  ): Promise<void> {
    // Sólo claves ya validadas como UUID entran al filtro; cualquier otra cosa
    // aborta el bloque sin marcar claves completas (fail-closed).
    if (!values.every(isLookupKey)) return;
    for (let i = 0; i < values.length; i += OWNER_LOOKUP_CHUNK) {
      const chunk = values.slice(i, i + OWNER_LOOKUP_CHUNK);
      const chunkRows: Array<Record<string, unknown>> = [];
      let exhausted = false;
      for (let offset = 0;; offset += OWNER_LOOKUP_PAGE) {
        const base = admin
          .from("supplier_bills")
          .select("id, cfdi_uuid, organization_id");
        // `cfdi_uuid` es texto con casing mixto en datos históricos: se compara
        // con `ilike` sin comodines (igualdad insensible a mayúsculas).
        const filtered = column === "cfdi_uuid"
          ? base.or(chunk.map((key) => `cfdi_uuid.ilike.${key}`).join(","))
          : base.in(column, chunk);
        const { data, error } = await filtered
          .order("id", { ascending: true })
          .range(offset, offset + OWNER_LOOKUP_PAGE - 1);
        if (error) return; // sin marcar completa ninguna clave del bloque
        const page = (data ?? []) as Array<Record<string, unknown>>;
        chunkRows.push(...page);
        if (page.length < OWNER_LOOKUP_PAGE) {
          exhausted = true;
          break;
        }
        if (chunkRows.length > chunk.length * OWNER_LOOKUP_MAX_ROWS_PER_KEY) {
          return; // truncación/duplicación anómala: fail-closed
        }
      }
      if (!exhausted) return;
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

  await readColumn("cfdi_uuid", keys.cfdiUuid, completeCfdiUuid);
  await readColumn("id", keys.id, completeId);

  return buildOrphanOwnerIndex(rows, {
    cfdiUuid: completeCfdiUuid,
    id: completeId,
  });
}

/**
 * Objetos sin referencia y sin prefijo exacto de organización. Es el conjunto
 * pequeño del que se derivan las claves a consultar.
 */
function collectUnreferencedUnscopedObjects(
  organizationIds: string[],
  inventory: Awaited<ReturnType<typeof collectStorageInventory>>,
  referencedPathsByBucket: Map<string, Set<string>>,
): Array<{ bucketId: string; sourcePath: string }> {
  if (inventory.truncated) return [];
  const result: Array<{ bucketId: string; sourcePath: string }> = [];
  for (const [bucketId, objectPaths] of inventory.objectPathsByBucket) {
    const referenced = referencedPathsByBucket.get(bucketId) ?? new Set();
    for (const sourcePath of objectPaths) {
      if (referenced.has(sourcePath)) continue;
      // Los objetos sin referencia que ya están bajo el prefijo exacto de una
      // organización conocida se dejan intactos: ni ledger, ni copia, ni
      // borrado.
      const alreadyScoped = organizationIds.some((organizationId) =>
        hasOrganizationStoragePrefix(organizationId, sourcePath)
      );
      if (alreadyScoped) continue;
      result.push({ bucketId, sourcePath });
    }
  }
  return result;
}

/**
 * Clasifica los objetos sin referencia y sin prefijo exacto. No existe ningún
 * atajo de "una sola organización": el dueño se deriva sólo por coincidencia
 * exacta de la clave del call-site con una única fila dueña conocida y con la
 * lectura de esa clave completa. Los huérfanos sin dueño, en conflicto o con
 * lectura incompleta no se devuelven y nunca entran al ledger.
 */
function collectOrphanCandidates(
  organizationIds: string[],
  unreferencedUnscoped: Array<{ bucketId: string; sourcePath: string }>,
  ownerIndex: OrphanOwnerIndex,
): {
  candidates: OrphanCandidate[];
  byBucket: ReturnType<typeof summarizeOrphanOwnership>;
  quarantine: ReturnType<typeof summarizeQuarantine>;
} {
  const candidates: OrphanCandidate[] = [];
  const entries: Array<
    { bucketId: string; resolution: OrphanOwnerResolution }
  > = [];

  for (const { bucketId, sourcePath } of unreferencedUnscoped) {
    const resolution = resolveOrphanOwner({
      bucketId,
      sourcePath,
      index: ownerIndex,
      knownOrganizationIds: organizationIds,
    });
    entries.push({ bucketId, resolution });
    if (resolution.status !== "resolved") continue;

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
  };
}

async function ensureOrphanLedger(
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

async function updateObject(
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

async function ensureLedger(
  admin: AdminClient,
  candidates: CandidateReference[],
): Promise<void> {
  const objectIds = new Map<string, string>();

  for (const candidate of candidates) {
    const key = `${candidate.spec.bucketId}/${candidate.sourcePath}`;
    let migrationId = objectIds.get(key);
    if (!migrationId) {
      const { data: existing, error: findError } = await admin
        .from("storage_object_migrations")
        .select("id")
        .eq("bucket_id", candidate.spec.bucketId)
        .eq("source_path", candidate.sourcePath)
        .maybeSingle();

      if (findError) {
        throw new Error("No se pudo consultar el ledger de objetos.");
      }

      if (existing?.id) {
        migrationId = existing.id as string;
      } else {
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
        migrationId = inserted.id as string;
      }
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

function specForReference(
  table: string,
  column: string,
): ReferenceSpec | undefined {
  return REFERENCE_SPECS.find(
    (spec) => spec.table === table && spec.column === column,
  );
}

async function storagePathExists(
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

/** Descarga un objeto y devuelve sólo su tamaño y SHA-256; nunca su ruta. */
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

/**
 * Compara byte a byte fuente y destino. Se ejecuta tanto tras copiar como
 * antes de borrar: un estado previo del ledger nunca sustituye esta prueba.
 */
async function verifyCopyIntegrity(
  admin: AdminClient,
  object: LedgerObject,
): Promise<CopyVerdict> {
  const [source, destination] = await Promise.all([
    objectDigest(admin, object.bucket_id, object.source_path),
    objectDigest(admin, object.bucket_id, object.destination_path),
  ]);
  return compareCopy(source, destination);
}

async function ensureCopied(
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

    const { error } = await admin.storage.from(object.bucket_id).copy(
      object.source_path,
      object.destination_path,
    );
    if (error) {
      await updateObject(admin, object.id, {
        status: "failed",
        last_error_code: "storage_copy_failed",
        attempt_count: object.attempt_count + 1,
      });
      return "failed";
    }
  }

  // Verificación de integridad: tamaño y SHA-256 de ambos lados. Se aplica
  // igual si el destino venía de un intento anterior. Si no coincide, no se
  // marca "copied" y por tanto no se tocan las referencias.
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
    await updateReference(admin, reference.id, {
      status: "failed",
      last_error_code: "invalid_ledger_reference",
    });
    return false;
  }

  const destinationValue = destinationReferenceValue(
    object.bucket_id,
    object.destination_path,
    reference.value_format,
    reference.public_url_origin,
  );
  if (!destinationValue) {
    await updateReference(admin, reference.id, {
      status: "failed",
      last_error_code: "destination_value_invalid",
    });
    return false;
  }

  const { data: current, error: readError } = await admin
    .from(reference.reference_table)
    .select(`organization_id, ${reference.reference_column}`)
    .eq("id", reference.reference_id)
    .maybeSingle();
  if (readError || !current) {
    await updateReference(admin, reference.id, {
      status: "failed",
      last_error_code: "reference_missing",
    });
    return false;
  }

  const row = current as unknown as Record<string, unknown>;
  if (row.organization_id !== object.organization_id) {
    await updateReference(admin, reference.id, {
      status: "failed",
      last_error_code: "reference_organization_mismatch",
    });
    return false;
  }

  const currentValue = row[reference.reference_column];
  if (typeof currentValue !== "string") {
    await updateReference(admin, reference.id, {
      status: "failed",
      last_error_code: "reference_value_missing",
    });
    return false;
  }

  if (currentValue === destinationValue) {
    await updateReference(admin, reference.id, {
      status: "updated",
      last_error_code: null,
    });
    return true;
  }

  if (await sha256(currentValue) !== reference.source_value_sha256) {
    await updateReference(admin, reference.id, {
      status: "failed",
      last_error_code: "reference_changed",
    });
    return false;
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
    await updateReference(admin, reference.id, {
      status: "failed",
      last_error_code: "reference_update_conflict",
    });
    return false;
  }

  await updateReference(admin, reference.id, {
    status: "updated",
    last_error_code: null,
  });
  return true;
}

// Apply: copiar, verificar destino y actualizar referencias. Sin borrado.
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
  // La fuente original queda intacta a propósito: el borrado es otra fase.
  return "references_updated";
}

async function applyBatch(
  admin: AdminClient,
  batchSize: number,
): Promise<Record<string, number>> {
  const { data: rows, error } = await admin
    .from("storage_object_migrations")
    .select(
      "id, bucket_id, organization_id, source_path, destination_path, discovery_kind, status, attempt_count",
    )
    .eq("discovery_kind", "referenced")
    .in("status", ["planned", "copied", "references_updated", "failed"])
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
    .in("migration_id", objects.map((object) => object.id));
  if (refsError) {
    throw new Error("No se pudieron leer las referencias pendientes.");
  }

  const refsByObject = new Map<string, LedgerReference[]>();
  for (const reference of (refs ?? []) as LedgerReference[]) {
    const list = refsByObject.get(reference.migration_id) ?? [];
    list.push(reference);
    refsByObject.set(reference.migration_id, list);
  }

  const outcomes = { references_updated: 0, pending: 0, failed: 0 };
  for (const object of objects) {
    const outcome = await processObject(
      admin,
      object,
      refsByObject.get(object.id) ?? [],
    );
    outcomes[outcome]++;
  }
  return outcomes;
}

// Huérfanos: sólo copia verificada. Nunca se borra la fuente ni el huérfano.
async function processOrphanObject(
  admin: AdminClient,
  object: LedgerObject,
): Promise<"copied" | "failed"> {
  return await ensureCopied(admin, object);
}

async function applyOrphanBatch(
  admin: AdminClient,
  batchSize: number,
): Promise<Record<string, number>> {
  const { data: rows, error } = await admin
    .from("storage_object_migrations")
    .select(
      "id, bucket_id, organization_id, source_path, destination_path, discovery_kind, status, attempt_count",
    )
    .eq("discovery_kind", "orphaned")
    .in("status", ["planned", "copied", "failed"])
    .order("created_at", { ascending: true })
    .limit(batchSize);
  if (error) throw new Error("No se pudo leer el lote de huérfanos.");

  const outcomes = { copied: 0, failed: 0 };
  for (const object of (rows ?? []) as LedgerObject[]) {
    outcomes[await processOrphanObject(admin, object)]++;
  }
  return outcomes;
}

/** Fase posterior e independiente: borrar fuentes ya migradas y verificadas. */
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
    // Revalidación obligatoria: ningún estado previo del ledger (`copied` o
    // `references_updated`) sustituye la comparación de bytes justo antes de
    // borrar. Si difieren o falta un lado, no se borra nada.
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

async function deleteSourcesBatch(
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

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;
  const respond = (body: unknown, status = 200) =>
    jsonResponse(req, body, { status });

  if (req.method !== "POST") {
    return respond({ error: "Method not allowed" }, 405);
  }

  const auth = await authenticateCronRequest(req);
  if (!auth.ok) return respond({ error: auth.error }, auth.status);

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
    // `delete_sources` no atribuye dueños: no necesita el índice y sus
    // comprobaciones quedan intactas.
    const ownerIndex = input.mode === "delete_sources"
      ? buildOrphanOwnerIndex([])
      : await loadOrphanOwnerIndex(
        admin,
        collectOrphanOwnerLookupKeys(unreferencedUnscoped),
      );
    const orphans = collectOrphanCandidates(
      plan.organizationIds,
      unreferencedUnscoped,
      ownerIndex,
    );
    const orphanCandidates = orphans.candidates;

    const orphanState = !inventoryComplete ? "inventory_incomplete" : "ready";

    const summary = {
      mode: input.mode,
      truncated: !inventoryComplete,
      counts: plan.counts,
      by_bucket: countByBucket(plan.candidates),
      storage_inventory: {
        complete: inventoryComplete,
        // Los objetos sin referencia se reportan separados: los que ya están
        // bajo un prefijo de organización no bloquean apply y se dejan
        // intactos; sólo los legados sin prefijo detienen la fase.
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
        // Sólo se preparan los huérfanos con dueño único y exacto; los
        // demás se reportan aparte y nunca entran al ledger.
        candidates: inventoryComplete ? orphanCandidates.length : null,
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
        // Lista de resolución MANUAL: nunca se traslada nada de aquí.
        quarantine: inventoryComplete ? orphans.quarantine : null,
        deletion: "never_allowed",
      },

      source_deletion: {
        phase: "separate",
        enabled: Deno.env.get(DELETE_ENV_FLAG) === "true",
      },
    };

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
      // Ya no se exige "una sola organización": la atribución es por
      // coincidencia exacta de la clave del call-site con una única fila
      // dueña. Los huérfanos sin dueño o en conflicto quedan fuera del ledger
      // y se reportan en `orphan_migration.owner_resolution`.
      if (orphanCandidates.length === 0) {
        return respond(
          { ...summary, error: "No orphan has a uniquely resolved owner." },
          409,
        );
      }

      await ensureOrphanLedger(admin, orphanCandidates);

      const outcomes = await applyOrphanBatch(admin, input.batchSize);
      return respond({ ...summary, outcomes });
    }

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
        {
          ...summary,
          error: "Increase max_objects_per_bucket before apply.",
        },
        409,
      );
    }
    // Sólo bloquea el legado sin prefijo: de esos objetos no se puede derivar
    // el dueño. Los objetos sin referencia que YA están bajo el prefijo de una
    // organización se dejan intactos (sin ledger, sin copia, sin borrado).
    if (inventory.unreferencedUnscopedObjects > 0) {
      return respond(
        {
          ...summary,
          error: "Resolve unscoped unreferenced Storage objects before apply.",
        },
        409,
      );
    }

    await ensureLedger(admin, plan.candidates);
    const outcomes = await applyBatch(admin, input.batchSize);
    return respond({ ...summary, outcomes });
  } catch {
    // No se propagan mensajes de Storage ni rutas en la respuesta.
    return respond({ error: "Storage migration operation failed." }, 500);
  }
});
