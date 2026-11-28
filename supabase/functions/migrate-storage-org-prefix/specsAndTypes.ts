import type { OrphanOwnerResolutionMethod } from "../_shared/storageOrphanOwner.ts";
import type { StorageReferenceFormat } from "../_shared/storageMigrationPlan.ts";
import type { getAdminClient } from "../_shared/supabaseClients.ts";

export const APPLY_CONFIRMATION = "COPY_UPDATE_VERIFY_NO_DELETE";
export const ORPHAN_APPLY_CONFIRMATION = "COPY_VERIFY_ORPHANS_NO_DELETE";
export const APPLY_ENV_FLAG = "STORAGE_MIGRATION_APPLY_ENABLED";
const DEFAULT_MAX_ROWS_PER_REFERENCE = 250;
const MAX_ROWS_PER_REFERENCE = 1_000;
const DEFAULT_BATCH_SIZE = 25;
const MAX_BATCH_SIZE = 100;
const DEFAULT_MAX_OBJECTS_PER_BUCKET = 1_000;
const MAX_OBJECTS_PER_BUCKET = 10_000;
export const MAX_PREFIXES_PER_BUCKET = 2_000;

export const REFERENCE_SPECS = [
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

export type ReferenceSpec = (typeof REFERENCE_SPECS)[number];
export type AdminClient = ReturnType<typeof getAdminClient>;

export interface CandidateReference {
  spec: ReferenceSpec;
  referenceId: string;
  organizationId: string;
  sourceValue: string;
  sourcePath: string;
  destinationPath: string;
  format: StorageReferenceFormat;
  publicUrlOrigin: string | null;
}

export interface OrphanCandidate {
  bucketId: string;
  organizationId: string;
  sourcePath: string;
  destinationPath: string;
  ownerResolutionMethod: OrphanOwnerResolutionMethod | "manual_resolution";
}

export interface LedgerObject {
  id: string;
  bucket_id: string;
  organization_id: string;
  source_path: string;
  destination_path: string;
  discovery_kind: "referenced" | "orphaned";
  status: string;
  attempt_count: number;
}

export interface LedgerReference {
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

type MigrationMode =
  | "plan"
  | "apply"
  | "apply_orphans"
  | "delete_sources";

export interface RequestInput {
  mode: MigrationMode;
  maxRowsPerReference: number;
  maxObjectsPerBucket: number;
  batchSize: number;
  confirmation: string | null;
}

const VALID_MODES = new Set<string>([
  "plan",
  "apply",
  "apply_orphans",
  "delete_sources",
]);

function boundedInteger(
  value: unknown,
  fallback: number,
  maximum: number,
): number {
  if (typeof value !== "number" || !Number.isInteger(value)) return fallback;
  return Math.max(1, Math.min(value, maximum));
}

export async function parseInput(req: Request): Promise<RequestInput | null> {
  let body: Record<string, unknown> = {};
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    if (req.method !== "POST") return null;
  }

  const rawMode = body.mode === undefined ? "plan" : body.mode;
  if (typeof rawMode !== "string" || !VALID_MODES.has(rawMode)) return null;
  return {
    mode: rawMode as MigrationMode,
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

export async function sha256(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((part) => part.toString(16).padStart(2, "0"))
    .join("");
}

export interface CandidateCounts {
  scanned: number;
  candidates: number;
  already_scoped: number;
  belongs_to_other_organization: number;
  unsupported: number;
  missing_organization: number;
}

export function emptyCounts(): CandidateCounts {
  return {
    scanned: 0,
    candidates: 0,
    already_scoped: 0,
    belongs_to_other_organization: 0,
    unsupported: 0,
    missing_organization: 0,
  };
}

export function countByBucket(
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

export function storageBucketIds(): string[] {
  return [...new Set(REFERENCE_SPECS.map((spec) => spec.bucketId))]
    .sort((left, right) => left.localeCompare(right));
}

export function specForReference(
  table: string,
  column: string,
): ReferenceSpec | undefined {
  return REFERENCE_SPECS.find(
    (spec) => spec.table === table && spec.column === column,
  );
}
