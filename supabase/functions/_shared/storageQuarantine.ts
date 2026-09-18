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
