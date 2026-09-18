import type {
  OrphanOwnerResolution,
  OrphanOwnershipBucketSummary,
} from "./storageOrphanOwner.ts";

/**
 * Cuarentena del traslado histórico de Storage.
 *
 * Todo objeto sin dueño exacto y verificable (sin coincidencia, con más de
 * una fila dueña, con empresa desconocida o con una lectura incompleta) NO se
 * traslada nunca: queda en una lista de resolución MANUAL. Sólo se exponen
 * conteos agregados; jamás rutas, URLs, identificadores ni tokens.
 */
export type QuarantineReason =
  | "owner_not_found"
  | "owner_conflict"
  | "unknown_organization"
  | "incomplete_lookup"
  | "unsupported_bucket"
  | "invalid_path";

export interface QuarantineBucketSummary {
  bucket: string;
  quarantined: number;
}

export interface QuarantineSummary {
  /** Objetos que exigen decisión humana antes de cualquier traslado. */
  total: number;
  /** Objetos con dueño único y verificable, listos para copiar/verificar. */
  ready: number;
  by_bucket: QuarantineBucketSummary[];
  by_reason: Record<QuarantineReason, number>;
}

function emptyReasons(): Record<QuarantineReason, number> {
  return {
    owner_not_found: 0,
    owner_conflict: 0,
    unknown_organization: 0,
    incomplete_lookup: 0,
    unsupported_bucket: 0,
    invalid_path: 0,
  };
}

function reasonOf(resolution: OrphanOwnerResolution): QuarantineReason | null {
  if (resolution.status === "resolved") return null;
  if (resolution.status === "conflict") return "owner_conflict";
  const reason = (resolution as { reason?: string }).reason;
  switch (reason) {
    case "unknown_organization":
      return "unknown_organization";
    case "incomplete_lookup":
      return "incomplete_lookup";
    case "unsupported_bucket":
      return "unsupported_bucket";
    case "invalid_path":
      return "invalid_path";
    default:
      return "owner_not_found";
  }
}

/**
 * Resume la cuarentena a partir de las resoluciones individuales y del
 * agregado por cubeta ya calculado por `summarizeOrphanOwnership`.
 */
export function summarizeQuarantine(
  entries: Iterable<{ bucketId: string; resolution: OrphanOwnerResolution }>,
  byBucket: OrphanOwnershipBucketSummary[] = [],
): QuarantineSummary {
  const reasons = emptyReasons();
  const buckets = new Map<string, number>(
    byBucket.map((bucket) => [bucket.bucket, 0]),
  );
  let total = 0;
  let ready = 0;

  for (const entry of entries) {
    const reason = reasonOf(entry.resolution);
    if (reason === null) {
      ready++;
      continue;
    }
    total++;
    reasons[reason]++;
    buckets.set(entry.bucketId, (buckets.get(entry.bucketId) ?? 0) + 1);
  }

  return {
    total,
    ready,
    by_bucket: [...buckets.entries()].map(([bucket, quarantined]) => ({
      bucket,
      quarantined,
    })),
    by_reason: reasons,
  };
}

/* -------------------------------------------------------------------------
 * Resolución MANUAL explícita y revalidada.
 *
 * Un objeto en cuarentena sólo puede salir de ella con una decisión humana
 * REGISTRADA en `public.storage_migration_manual_resolutions` (tabla deny-all,
 * accesible sólo por service_role). Registrar no basta: antes de copiar se
 * revalida contra el estado vivo. Todo lo que no encaje exactamente se queda
 * en cuarentena; nunca se adivina el dueño.
 * ------------------------------------------------------------------------- */

/** Registro de decisión humana leído desde la tabla de resoluciones. */
export interface ManualResolutionRecord {
  bucket_id: string;
  source_path: string;
  organization_id: string;
  resolved_by: string;
  justification: string;
  /** Momento de la última revalidación por el operador (ISO 8601). */
  revalidated_at: string;
  status: "active" | "revoked";
}

export type ManualResolutionRejection =
  | "no_manual_resolution"
  | "revoked"
  | "identity_mismatch"
  | "unknown_organization"
  | "inactive_organization"
  | "contradicts_derived_owner"
  | "incomplete_lookup"
  | "missing_justification"
  | "revalidation_expired"
  | "unsupported_bucket";

export type ManualResolutionDecision =
  | { allowed: true; organizationId: string; source: "manual_resolution" }
  | { allowed: false; reason: ManualResolutionRejection };

/** Ventana máxima entre la revalidación del operador y la copia. */
export const MANUAL_RESOLUTION_MAX_AGE_MS = 24 * 60 * 60 * 1000;

export interface ManualResolutionInput {
  bucketId: string;
  sourcePath: string;
  /** Resolución derivada automáticamente para ese mismo objeto. */
  derived: OrphanOwnerResolution;
  /** Registro leído de la tabla, o null si no existe. */
  record: ManualResolutionRecord | null;
  /** Organizaciones conocidas y ACTIVAS. */
  activeOrganizationIds: readonly string[];
  /** Organizaciones conocidas (activas o suspendidas). */
  knownOrganizationIds: readonly string[];
  now?: number;
}

/**
 * Decide, de forma pura y fail-closed, si un objeto en cuarentena puede
 * copiarse por decisión manual. No hace E/S y no expone rutas: el llamador
 * sólo debe propagar conteos.
 */
export function evaluateManualResolution(
  input: ManualResolutionInput,
): ManualResolutionDecision {
  const { record, derived } = input;
  if (record === null) {
    return { allowed: false, reason: "no_manual_resolution" };
  }
  if (record.status !== "active") return { allowed: false, reason: "revoked" };

  if (
    record.bucket_id !== input.bucketId ||
    record.source_path !== input.sourcePath
  ) {
    return { allowed: false, reason: "identity_mismatch" };
  }

  if (record.justification.trim().length < 10) {
    return { allowed: false, reason: "missing_justification" };
  }

  // Una lectura incompleta del índice de dueños invalida cualquier decisión:
  // el operador no pudo ver el universo completo de filas candidatas.
  if (
    derived.status === "unresolved" && derived.reason === "incomplete_lookup"
  ) {
    return { allowed: false, reason: "incomplete_lookup" };
  }
  if (
    derived.status === "unresolved" && derived.reason === "unsupported_bucket"
  ) {
    return { allowed: false, reason: "unsupported_bucket" };
  }

  // La decisión humana nunca puede contradecir un dueño derivado con certeza.
  if (
    derived.status === "resolved" &&
    derived.organizationId !== record.organization_id
  ) {
    return { allowed: false, reason: "contradicts_derived_owner" };
  }

  if (!input.knownOrganizationIds.includes(record.organization_id)) {
    return { allowed: false, reason: "unknown_organization" };
  }
  if (!input.activeOrganizationIds.includes(record.organization_id)) {
    return { allowed: false, reason: "inactive_organization" };
  }

  const revalidatedAt = Date.parse(record.revalidated_at);
  const now = input.now ?? Date.now();
  if (
    Number.isNaN(revalidatedAt) ||
    revalidatedAt > now ||
    now - revalidatedAt > MANUAL_RESOLUTION_MAX_AGE_MS
  ) {
    return { allowed: false, reason: "revalidation_expired" };
  }

  return {
    allowed: true,
    organizationId: record.organization_id,
    source: "manual_resolution",
  };
}

/* -------------------------------------------------------------------------
 * Allowlist de ESTA ejecución para el lote de huérfanos.
 *
 * El ledger es histórico: una fila `orphaned` en `planned/copied/failed` pudo
 * crearse con una resolución manual que hoy está revocada, caduca o
 * contradicha. Copiar por la mera existencia del ledger rompería el
 * fail-closed. Por eso cada corrida deriva su propia allowlist exacta
 * (bucket + source_path + organization_id) y todo lo demás se ignora.
 * ------------------------------------------------------------------------- */

export interface ApprovedOrphanIdentity {
  bucketId: string;
  sourcePath: string;
  organizationId: string;
}

export interface OrphanLedgerRowIdentity {
  bucket_id: string;
  source_path: string;
  organization_id: string;
}

/** Clave exacta e inequívoca de un objeto huérfano aprobado. */
export function approvedOrphanKey(
  bucketId: string,
  sourcePath: string,
  organizationId: string,
): string {
  return `${bucketId}\n${sourcePath}\n${organizationId}`;
}

/** Allowlist derivada de los candidatos revalidados en esta ejecución. */
export function makeApprovedOrphanKeySet(
  approved: readonly ApprovedOrphanIdentity[],
): Set<string> {
  return new Set(
    approved.map((candidate) =>
      approvedOrphanKey(
        candidate.bucketId,
        candidate.sourcePath,
        candidate.organizationId,
      )
    ),
  );
}

/**
 * Filtra el lote leído del ledger contra la allowlist de esta ejecución.
 * Fail-closed: si la allowlist está vacía, no pasa ninguna fila.
 */
export function filterOrphanLedgerToApproved<T extends OrphanLedgerRowIdentity>(
  rows: readonly T[],
  approvedKeys: ReadonlySet<string>,
): { allowed: T[]; skipped: number } {
  const allowed: T[] = [];
  let skipped = 0;
  for (const row of rows) {
    const key = approvedOrphanKey(
      row.bucket_id,
      row.source_path,
      row.organization_id,
    );
    if (approvedKeys.has(key)) allowed.push(row);
    else skipped++;
  }
  return { allowed, skipped };
}
