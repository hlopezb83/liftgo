import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  DELETE_CONFIRMATION,
  deleteEligibility,
  deleteGateDecision,
} from "./storageDeletePhase.ts";

const ORG = "2f3d0e7a-9b8c-4a56-8a22-41d9e8f0c123";
const OTHER_ORG = "3f3d0e7a-9b8c-4a56-8a22-41d9e8f0c123";

const okReference = {
  status: "updated",
  organizationId: ORG,
  currentValue: `${ORG}/a.xml`,
  expectedValue: `${ORG}/a.xml`,
};
const referencedObject = {
  discovery_kind: "referenced" as const,
  status: "references_updated",
  organization_id: ORG,
};

Deno.test("deletePhase: la bandera apagada bloquea el borrado", () => {
  assertEquals(
    deleteGateDecision({
      flagValue: undefined,
      confirmation: DELETE_CONFIRMATION,
      inventoryComplete: true,
    }),
    { allowed: false, status: 403, errorCode: "source_deletion_disabled" },
  );
});

Deno.test("deletePhase: exige confirmación textual propia e inventario completo", () => {
  assertEquals(
    deleteGateDecision({
      flagValue: "true",
      confirmation: "COPY_UPDATE_VERIFY_DELETE",
      inventoryComplete: true,
    }),
    {
      allowed: false,
      status: 409,
      errorCode: "source_deletion_confirmation_required",
    },
  );
  assertEquals(
    deleteGateDecision({
      flagValue: "true",
      confirmation: DELETE_CONFIRMATION,
      inventoryComplete: false,
    }),
    { allowed: false, status: 409, errorCode: "inventory_incomplete" },
  );
  assertEquals(
    deleteGateDecision({
      flagValue: "true",
      confirmation: DELETE_CONFIRMATION,
      inventoryComplete: true,
    }),
    { allowed: true },
  );
});

Deno.test("deletePhase: los huérfanos nunca son elegibles", () => {
  assertEquals(
    deleteEligibility(
      { ...referencedObject, discovery_kind: "orphaned" },
      [okReference],
      true,
    ),
    "orphans_never_deleted",
  );
});

Deno.test("deletePhase: sólo borra tras referencias actualizadas y destino verificado", () => {
  assertEquals(
    deleteEligibility(referencedObject, [okReference], true),
    "eligible",
  );
  assertEquals(
    deleteEligibility(referencedObject, [okReference], false),
    "destination_missing",
  );
  assertEquals(
    deleteEligibility({ ...referencedObject, status: "copied" }, [
      okReference,
    ], true),
    "references_not_updated",
  );
  assertEquals(
    deleteEligibility(referencedObject, [], true),
    "no_references",
  );
  assertEquals(
    deleteEligibility({ ...referencedObject, status: "source_deleted" }, [
      okReference,
    ], true),
    "already_deleted",
  );
});

Deno.test("deletePhase: bloquea referencias de otra organización o que no apuntan al destino", () => {
  assertEquals(
    deleteEligibility(
      referencedObject,
      [{ ...okReference, organizationId: OTHER_ORG }],
      true,
    ),
    "reference_organization_mismatch",
  );
  assertEquals(
    deleteEligibility(
      referencedObject,
      [{ ...okReference, currentValue: "a.xml" }],
      true,
    ),
    "reference_not_pointing_to_destination",
  );
  assertEquals(
    deleteEligibility(
      referencedObject,
      [{ ...okReference, status: "failed" }],
      true,
    ),
    "references_not_updated",
  );
});
