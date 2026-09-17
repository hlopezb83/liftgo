// Fase separada de borrado de fuentes de Storage.
//
// El modo `apply` NUNCA borra: sólo inventaría, copia, verifica el destino y
// actualiza referencias. Borrar las fuentes es una fase posterior, explícita y
// apagada por defecto, que exige bandera de entorno propia, confirmación
// textual distinta y verificación previa de destino y referencias.
//
// Regla dura: los objetos huérfanos (sin referencia) jamás se borran aquí.

export const DELETE_ENV_FLAG = "STORAGE_MIGRATION_DELETE_SOURCES_ENABLED";
export const DELETE_CONFIRMATION = "DELETE_MIGRATED_SOURCES_AFTER_VERIFY";

export type DeleteGateDecision =
  | { allowed: true }
  | { allowed: false; status: number; errorCode: string };

/** Puertas independientes que deben pasar antes de tocar una sola fuente. */
export function deleteGateDecision(input: {
  flagValue: string | undefined;
  confirmation: string | null;
  inventoryComplete: boolean;
}): DeleteGateDecision {
  if (input.flagValue !== "true") {
    return {
      allowed: false,
      status: 403,
      errorCode: "source_deletion_disabled",
    };
  }
  if (input.confirmation !== DELETE_CONFIRMATION) {
    return {
      allowed: false,
      status: 409,
      errorCode: "source_deletion_confirmation_required",
    };
  }
  if (!input.inventoryComplete) {
    return {
      allowed: false,
      status: 409,
      errorCode: "inventory_incomplete",
    };
  }
  return { allowed: true };
}

export interface DeletableObject {
  discovery_kind: "referenced" | "orphaned";
  status: string;
  organization_id: string;
}

export interface DeletableReferenceCheck {
  status: string;
  organizationId: string | null;
  currentValue: string | null;
  expectedValue: string | null;
}

export type DeleteEligibility =
  | "eligible"
  | "already_deleted"
  | "orphans_never_deleted"
  | "references_not_updated"
  | "no_references"
  | "reference_organization_mismatch"
  | "reference_not_pointing_to_destination"
  | "destination_missing";

/**
 * Decide si una fuente puede borrarse. Sólo aplica a objetos referenciados,
 * con todas sus referencias ya apuntando al destino y el destino verificado.
 */
export function deleteEligibility(
  object: DeletableObject,
  references: DeletableReferenceCheck[],
  destinationExists: boolean,
): DeleteEligibility {
  if (object.discovery_kind !== "referenced") return "orphans_never_deleted";
  if (object.status === "source_deleted") return "already_deleted";
  if (object.status !== "references_updated") return "references_not_updated";
  if (references.length === 0) return "no_references";

  for (const reference of references) {
    if (reference.status !== "updated") return "references_not_updated";
    if (reference.organizationId !== object.organization_id) {
      return "reference_organization_mismatch";
    }
    if (
      !reference.expectedValue ||
      reference.currentValue !== reference.expectedValue
    ) {
      return "reference_not_pointing_to_destination";
    }
  }

  if (!destinationExists) return "destination_missing";
  return "eligible";
}
