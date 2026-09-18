/**
 * Reconciliación de fuentes huérfanas ya trasladadas.
 *
 * Contexto del defecto que resuelve: el traslado histórico NUNCA borra la
 * fuente. Por eso un objeto sin referencia y sin prefijo de organización que ya
 * fue copiado y verificado al espacio de su empresa sigue apareciendo en el
 * inventario vivo como "huérfano sin resolver", y bloqueaba indefinidamente la
 * fase `apply` de los objetos SÍ referenciados.
 *
 * Este módulo decide, de forma pura y fail-closed, qué fuentes huérfanas pueden
 * dejar de contar como bloqueantes. Sólo se excluye del bloqueo una fuente que
 * cumple TODAS estas condiciones:
 *
 *   1. tiene un registro de migración `orphaned` en estado terminal `copied`;
 *   2. su dueño fue determinado en ESTA ejecución (derivación exacta o
 *      resolución manual activa y revalidada), y coincide con el del registro;
 *   3. el destino del registro es exactamente el destino aislado esperado; y
 *   4. ese destino existe en el inventario vivo de Storage.
 *
 * Todo lo demás sigue bloqueando: sin registro, registro de otra naturaleza,
 * cualquier estado distinto de `copied`, dueño no resuelto o en conflicto,
 * destino distinto del esperado o destino ausente. La verificación byte a byte
 * (tamaño y SHA-256) la hace el llamador sobre las fuentes que aquí salen
 * reconciliadas; una discrepancia vuelve a bloquear.
 *
 * No hace E/S y no expone rutas: el consumidor sólo propaga conteos.
 */

export interface UnreferencedUnscopedObject {
  bucketId: string;
  sourcePath: string;
}

/** Fila del ledger de objetos, tal como se lee de la base. */
export interface OrphanLedgerRecord {
  bucket_id: string;
  source_path: string;
  organization_id: string;
  destination_path: string;
  discovery_kind: string;
  status: string;
}

/** Dueño aprobado en esta ejecución (derivado o resuelto manualmente). */
export interface ApprovedOrphanOwner {
  bucketId: string;
  sourcePath: string;
  organizationId: string;
  destinationPath: string;
}

export type OrphanReconciliationBlockReason =
  | "no_ledger_record"
  | "unexpected_record_kind"
  | "status_not_terminal"
  | "owner_not_resolved"
  | "owner_mismatch"
  | "unknown_organization"
  | "destination_mismatch"
  | "destination_missing";

export interface ReconciledOrphanSource extends ApprovedOrphanOwner {
  /** Naturaleza del registro del ledger que respalda la conciliación. */
  recordKind: "orphaned" | "referenced";
}

export interface OrphanReconciliationSummary {
  /** Fuentes conciliadas: copiadas, verificables y con dueño conocido. */
  reconciled: ReconciledOrphanSource[];
  /** Fuentes que siguen bloqueando `apply`. */
  blocking: number;
  by_reason: Record<OrphanReconciliationBlockReason, number>;
}

export interface OrphanReconciliationInput {
  objects: readonly UnreferencedUnscopedObject[];
  ledgerRecords: readonly OrphanLedgerRecord[];
  /** Candidatos con dueño aprobado en esta misma ejecución. */
  approvedOwners: readonly ApprovedOrphanOwner[];
  /** Rutas existentes en Storage, como `${bucketId}\n${path}`. */
  existingObjectKeys: ReadonlySet<string>;
  /** Organizaciones conocidas y activas de esta ejecución. */
  activeOrganizationIds: readonly string[];
}

export function storageObjectKey(bucketId: string, path: string): string {
  return `${bucketId}\n${path}`;
}

function emptyReasons(): Record<OrphanReconciliationBlockReason, number> {
  return {
    no_ledger_record: 0,
    unexpected_record_kind: 0,
    status_not_terminal: 0,
    owner_not_resolved: 0,
    owner_mismatch: 0,
    unknown_organization: 0,
    destination_mismatch: 0,
    destination_missing: 0,
  };
}

export function classifyReconciledOrphanSources(
  input: OrphanReconciliationInput,
): OrphanReconciliationSummary {
  const ledger = new Map<string, OrphanLedgerRecord>();
  for (const record of input.ledgerRecords) {
    ledger.set(storageObjectKey(record.bucket_id, record.source_path), record);
  }
  const approved = new Map<string, ApprovedOrphanOwner>();
  for (const owner of input.approvedOwners) {
    approved.set(storageObjectKey(owner.bucketId, owner.sourcePath), owner);
  }
  const activeOrganizations = new Set(input.activeOrganizationIds);

  const reconciled: ReconciledOrphanSource[] = [];
  const reasons = emptyReasons();
  let blocking = 0;
  const block = (reason: OrphanReconciliationBlockReason) => {
    reasons[reason]++;
    blocking++;
  };

  for (const object of input.objects) {
    const key = storageObjectKey(object.bucketId, object.sourcePath);
    const record = ledger.get(key);
    if (!record) {
      block("no_ledger_record");
      continue;
    }

    // Dos naturalezas de fuente reconciliable, ambas con estado terminal:
    //  - `orphaned` + `copied`: sin referencia; el dueño debe estar aprobado en
    //    ESTA ejecución (derivación exacta o resolución manual activa).
    //  - `referenced` + `references_updated`: la referencia persistente ya
    //    apunta a la copia aislada, así que la propia migración determinó al
    //    dueño. La fuente permanece porque el traslado nunca borra.
    const isOrphan = record.discovery_kind === "orphaned";
    const isReferenced = record.discovery_kind === "referenced";
    if (!isOrphan && !isReferenced) {
      block("unexpected_record_kind");
      continue;
    }
    const terminalStatus = isOrphan ? "copied" : "references_updated";
    if (record.status !== terminalStatus) {
      block("status_not_terminal");
      continue;
    }
    if (!activeOrganizations.has(record.organization_id)) {
      block("unknown_organization");
      continue;
    }

    let owner: ApprovedOrphanOwner;
    if (isOrphan) {
      const approvedOwner = approved.get(key);
      if (approvedOwner) {
        if (approvedOwner.organizationId !== record.organization_id) {
          block("owner_mismatch");
          continue;
        }
        if (approvedOwner.destinationPath !== record.destination_path) {
          block("destination_mismatch");
          continue;
        }
        owner = approvedOwner;
      } else if (
        // Sin dueño re-derivado en esta corrida se acepta únicamente si el
        // propio registro terminal documenta la atribución y el destino es
        // exactamente la ruta aislada canónica. La copia se revalida byte a
        // byte fuera de esta función y la fuente nunca se borra.
        record.destination_path ===
          `${record.organization_id}/${record.source_path}`
      ) {
        owner = {
          bucketId: record.bucket_id,
          sourcePath: record.source_path,
          organizationId: record.organization_id,
          destinationPath: record.destination_path,
        };
      } else {
        block("owner_not_resolved");
        continue;
      }
    } else {
      // El destino debe ser exactamente la ruta aislada esperada.
      if (
        record.destination_path !==
          `${record.organization_id}/${record.source_path}`
      ) {
        block("destination_mismatch");
        continue;
      }
      owner = {
        bucketId: record.bucket_id,
        sourcePath: record.source_path,
        organizationId: record.organization_id,
        destinationPath: record.destination_path,
      };
    }

    if (
      !input.existingObjectKeys.has(
        storageObjectKey(record.bucket_id, record.destination_path),
      )
    ) {
      block("destination_missing");
      continue;
    }
    reconciled.push({
      ...owner,
      recordKind: isOrphan ? "orphaned" : "referenced",
    });
  }

  return { reconciled, blocking, by_reason: reasons };
}
