import { isUUID } from "./validate.ts";

/**
 * Resolución determinista del dueño de un objeto de Storage sin referencia y
 * sin prefijo de organización.
 *
 * Sólo se aceptan claves documentadas por el punto de subida real (call-site):
 * - `supplier-bill-cfdi-xml`: el primer segmento histórico es el UUID fiscal
 *   del CFDI (`useUploadSupplierBillXml`), que corresponde a
 *   `supplier_bills.cfdi_uuid`.
 * - `supplier-payment-receipts`: el primer segmento histórico es el `billId`
 *   del comprobante (`useUploadSupplierReceipt`), que corresponde a
 *   `supplier_bills.id`.
 *
 * Nunca se infiere la organización por la forma del UUID, por ser la única
 * organización existente, ni por nombre de archivo o fecha. Cero coincidencias,
 * varias filas dueñas o varias organizaciones ⇒ sin asignación.
 */
export type OrphanOwnerResolutionMethod =
  | "supplier_bill_cfdi_uuid"
  | "supplier_bill_id";

export type OrphanOwnerUnresolvedReason =
  | "unsupported_bucket"
  | "invalid_path"
  | "no_match"
  | "incomplete_lookup"
  | "unknown_organization";


export type OrphanOwnerConflictReason =
  | "multiple_owner_rows"
  | "multiple_organizations";

export type OrphanOwnerResolution =
  | {
    status: "resolved";
    organizationId: string;
    method: OrphanOwnerResolutionMethod;
  }
  | { status: "unresolved"; reason: OrphanOwnerUnresolvedReason }
  | { status: "conflict"; reason: OrphanOwnerConflictReason };

/** Fila dueña candidata: sólo clave normalizada y organización. */
export interface OrphanOwnerRow {
  key: string;
  organizationId: string;
}

export interface OrphanOwnerIndex {
  /** `supplier_bills.cfdi_uuid` → organizaciones de cada fila coincidente. */
  supplierBillsByCfdiUuid: Map<string, string[]>;
  /** `supplier_bills.id` → organizaciones de cada fila coincidente. */
  supplierBillsById: Map<string, string[]>;
  /**
   * Claves cuya lectura se completó (se agotó la paginación sin truncación).
   * Fail-closed: una clave ausente aquí nunca puede resolverse, aunque el mapa
   * traiga filas, porque la respuesta pudo venir truncada y ocultar duplicados.
   */
  completeCfdiUuidKeys: Set<string>;
  completeIdKeys: Set<string>;
}


const BUCKET_METHODS: Record<string, OrphanOwnerResolutionMethod> = {
  "supplier-bill-cfdi-xml": "supplier_bill_cfdi_uuid",
  "supplier-payment-receipts": "supplier_bill_id",
};

function addRow(target: Map<string, string[]>, row: OrphanOwnerRow): void {
  const key = typeof row.key === "string" ? row.key.trim().toLowerCase() : "";
  const organizationId = typeof row.organizationId === "string"
    ? row.organizationId.trim()
    : "";
  if (!key || !organizationId) return;
  target.set(key, [...(target.get(key) ?? []), organizationId]);
}

function normalizeKey(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

/**
 * Construye el índice sólo con las filas leídas y con el conjunto de claves
 * cuya lectura se agotó sin truncación. Sin `completeKeys` el índice queda
 * fail-closed: ninguna clave puede resolverse.
 */
export function buildOrphanOwnerIndex(
  supplierBills: Array<
    { id?: unknown; cfdiUuid?: unknown; organizationId?: unknown }
  >,
  completeKeys?: {
    cfdiUuid?: Iterable<string>;
    id?: Iterable<string>;
  },
): OrphanOwnerIndex {
  const supplierBillsByCfdiUuid = new Map<string, string[]>();
  const supplierBillsById = new Map<string, string[]>();

  for (const bill of supplierBills) {
    const organizationId = typeof bill.organizationId === "string"
      ? bill.organizationId
      : "";
    if (!organizationId) continue;
    if (typeof bill.id === "string") {
      addRow(supplierBillsById, { key: bill.id, organizationId });
    }
    if (typeof bill.cfdiUuid === "string") {
      addRow(supplierBillsByCfdiUuid, { key: bill.cfdiUuid, organizationId });
    }
  }

  const completeCfdiUuidKeys = new Set(
    [...(completeKeys?.cfdiUuid ?? [])].map(normalizeKey).filter(Boolean),
  );
  const completeIdKeys = new Set(
    [...(completeKeys?.id ?? [])].map(normalizeKey).filter(Boolean),
  );

  return {
    supplierBillsByCfdiUuid,
    supplierBillsById,
    completeCfdiUuidKeys,
    completeIdKeys,
  };
}

function firstSegment(sourcePath: unknown): string {
  const path = typeof sourcePath === "string"
    ? sourcePath.trim().replace(/^\/+/, "")
    : "";
  const separator = path.indexOf("/");
  if (separator <= 0) return "";
  return path.slice(0, separator).trim().toLowerCase();
}

/**
 * Clave de búsqueda de un huérfano: método (derivado de la cubeta) y primer
 * segmento válido. Permite consultar sólo las filas dueñas necesarias, en vez
 * de leer toda la tabla.
 */
export function orphanOwnerLookupKey(
  bucketId: string,
  sourcePath: string,
): { method: OrphanOwnerResolutionMethod; key: string } | null {
  const method = BUCKET_METHODS[bucketId];
  if (!method) return null;
  const segment = firstSegment(sourcePath);
  if (!segment || !isUUID(segment)) return null;
  return { method, key: segment };
}

/** Conjunto mínimo de claves a consultar, agrupadas por método. */
export function collectOrphanOwnerLookupKeys(
  objects: Iterable<{ bucketId: string; sourcePath: string }>,
): { cfdiUuid: string[]; id: string[] } {
  const cfdiUuid = new Set<string>();
  const id = new Set<string>();
  for (const object of objects) {
    const lookup = orphanOwnerLookupKey(object.bucketId, object.sourcePath);
    if (!lookup) continue;
    if (lookup.method === "supplier_bill_cfdi_uuid") cfdiUuid.add(lookup.key);
    else id.add(lookup.key);
  }
  return { cfdiUuid: [...cfdiUuid], id: [...id] };
}


/** Resuelve el dueño de un huérfano por coincidencia exacta de la clave. */
export function resolveOrphanOwner(input: {
  bucketId: string;
  sourcePath: string;
  index: OrphanOwnerIndex;
  knownOrganizationIds: Iterable<string>;
}): OrphanOwnerResolution {
  const method = BUCKET_METHODS[input.bucketId];
  if (!method) return { status: "unresolved", reason: "unsupported_bucket" };

  const segment = firstSegment(input.sourcePath);
  if (!segment || !isUUID(segment)) {
    return { status: "unresolved", reason: "invalid_path" };
  }

  const lookup = method === "supplier_bill_cfdi_uuid"
    ? input.index.supplierBillsByCfdiUuid
    : input.index.supplierBillsById;
  const rows = lookup.get(segment) ?? [];
  if (rows.length === 0) return { status: "unresolved", reason: "no_match" };

  const organizations = new Set(rows.map((id) => id.toLowerCase()));
  if (organizations.size > 1) {
    return { status: "conflict", reason: "multiple_organizations" };
  }
  if (rows.length > 1) {
    return { status: "conflict", reason: "multiple_owner_rows" };
  }

  const known = new Set(
    [...input.knownOrganizationIds]
      .filter((id): id is string => typeof id === "string")
      .map((id) => id.trim().toLowerCase()),
  );
  const organizationId = rows[0];
  if (!known.has(organizationId.toLowerCase())) {
    return { status: "unresolved", reason: "unknown_organization" };
  }

  return { status: "resolved", organizationId, method };
}

export interface OrphanOwnershipBucketSummary {
  bucket: string;
  unreferenced_unscoped_objects: number;
  owner_resolved: number;
  owner_missing: number;
  owner_conflicting: number;
}

/** Sólo conteos agregados: nunca rutas, IDs, UUID fiscales ni URLs. */
export function summarizeOrphanOwnership(
  entries: Iterable<{ bucketId: string; resolution: OrphanOwnerResolution }>,
): OrphanOwnershipBucketSummary[] {
  const byBucket = new Map<string, OrphanOwnershipBucketSummary>();

  for (const entry of entries) {
    const summary = byBucket.get(entry.bucketId) ?? {
      bucket: entry.bucketId,
      unreferenced_unscoped_objects: 0,
      owner_resolved: 0,
      owner_missing: 0,
      owner_conflicting: 0,
    };
    summary.unreferenced_unscoped_objects++;
    if (entry.resolution.status === "resolved") summary.owner_resolved++;
    else if (entry.resolution.status === "conflict") {
      summary.owner_conflicting++;
    } else summary.owner_missing++;
    byBucket.set(entry.bucketId, summary);
  }

  return [...byBucket.values()];
}
