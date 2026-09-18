import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import {
  type ApprovedOrphanOwner,
  classifyReconciledOrphanSources,
  type OrphanLedgerRecord,
  storageObjectKey,
} from "./storageOrphanReconciliation.ts";

const ORG = "11111111-1111-1111-1111-111111111111";
const OTHER_ORG = "22222222-2222-2222-2222-222222222222";
const BUCKET = "supplier-bill-cfdi-xml";
const ACTIVE = [ORG];

function owner(sourcePath: string, organizationId = ORG): ApprovedOrphanOwner {
  return {
    bucketId: BUCKET,
    sourcePath,
    organizationId,
    destinationPath: `${organizationId}/${sourcePath}`,
  };
}

function record(
  sourcePath: string,
  overrides: Partial<OrphanLedgerRecord> = {},
): OrphanLedgerRecord {
  return {
    bucket_id: BUCKET,
    source_path: sourcePath,
    organization_id: ORG,
    destination_path: `${ORG}/${sourcePath}`,
    discovery_kind: "orphaned",
    status: "copied",
    ...overrides,
  };
}

function destinationExists(sourcePath: string, organizationId = ORG) {
  return new Set([
    storageObjectKey(BUCKET, `${organizationId}/${sourcePath}`),
  ]);
}

Deno.test("reconcilia la fuente copiada y verificada, y bloquea al huérfano sin resolver", () => {
  const summary = classifyReconciledOrphanSources({
    objects: [
      { bucketId: BUCKET, sourcePath: "ok.xml" },
      { bucketId: BUCKET, sourcePath: "sin-dueno.xml" },
    ],
    ledgerRecords: [record("ok.xml")],
    approvedOwners: [owner("ok.xml")],
    existingObjectKeys: destinationExists("ok.xml"),
    activeOrganizationIds: ACTIVE,
  });
  assertEquals(summary.reconciled.length, 1);
  assertEquals(summary.reconciled[0].sourcePath, "ok.xml");
  assertEquals(summary.blocking, 1);
  assertEquals(summary.by_reason.no_ledger_record, 1);
});

Deno.test("reconcilia una fuente referenciada cuya referencia ya apunta a la copia", () => {
  const summary = classifyReconciledOrphanSources({
    objects: [{ bucketId: BUCKET, sourcePath: "ref.xml" }],
    ledgerRecords: [
      record("ref.xml", {
        discovery_kind: "referenced",
        status: "references_updated",
      }),
    ],
    approvedOwners: [],
    existingObjectKeys: destinationExists("ref.xml"),
    activeOrganizationIds: ACTIVE,
  });
  assertEquals(summary.reconciled.length, 1);
  assertEquals(summary.blocking, 0);
});

Deno.test("bloquea estados no terminales según la naturaleza del registro", () => {
  for (const status of ["planned", "failed", "references_updated", "deleted"]) {
    const summary = classifyReconciledOrphanSources({
      objects: [{ bucketId: BUCKET, sourcePath: "x.xml" }],
      ledgerRecords: [record("x.xml", { status })],
      approvedOwners: [owner("x.xml")],
      existingObjectKeys: destinationExists("x.xml"),
      activeOrganizationIds: ACTIVE,
    });
    assertEquals(summary.reconciled.length, 0, status);
    assertEquals(summary.by_reason.status_not_terminal, 1, status);
  }
  for (const status of ["planned", "copied", "failed", "deleted"]) {
    const summary = classifyReconciledOrphanSources({
      objects: [{ bucketId: BUCKET, sourcePath: "x.xml" }],
      ledgerRecords: [
        record("x.xml", { discovery_kind: "referenced", status }),
      ],
      approvedOwners: [],
      existingObjectKeys: destinationExists("x.xml"),
      activeOrganizationIds: ACTIVE,
    });
    assertEquals(summary.reconciled.length, 0, status);
    assertEquals(summary.by_reason.status_not_terminal, 1, status);
  }
});

Deno.test("bloquea si la copia no existe en el inventario vivo", () => {
  const summary = classifyReconciledOrphanSources({
    objects: [{ bucketId: BUCKET, sourcePath: "x.xml" }],
    ledgerRecords: [record("x.xml")],
    approvedOwners: [owner("x.xml")],
    existingObjectKeys: new Set(),
    activeOrganizationIds: ACTIVE,
  });
  assertEquals(summary.reconciled.length, 0);
  assertEquals(summary.by_reason.destination_missing, 1);
});

Deno.test("bloquea dueño no aprobado, dueño distinto y destino distinto", () => {
  const missingOwner = classifyReconciledOrphanSources({
    objects: [{ bucketId: BUCKET, sourcePath: "x.xml" }],
    ledgerRecords: [record("x.xml")],
    approvedOwners: [],
    existingObjectKeys: destinationExists("x.xml"),
    activeOrganizationIds: ACTIVE,
  });
  assertEquals(missingOwner.by_reason.owner_not_resolved, 1);

  const mismatch = classifyReconciledOrphanSources({
    objects: [{ bucketId: BUCKET, sourcePath: "x.xml" }],
    ledgerRecords: [record("x.xml", { organization_id: OTHER_ORG })],
    approvedOwners: [owner("x.xml")],
    existingObjectKeys: destinationExists("x.xml"),
    activeOrganizationIds: [ORG, OTHER_ORG],
  });
  assertEquals(mismatch.by_reason.owner_mismatch, 1);

  const wrongDestination = classifyReconciledOrphanSources({
    objects: [{ bucketId: BUCKET, sourcePath: "x.xml" }],
    ledgerRecords: [record("x.xml", { destination_path: "otro/x.xml" })],
    approvedOwners: [owner("x.xml")],
    existingObjectKeys: new Set([storageObjectKey(BUCKET, "otro/x.xml")]),
    activeOrganizationIds: ACTIVE,
  });
  assertEquals(wrongDestination.by_reason.destination_mismatch, 1);

  const referencedWrongDestination = classifyReconciledOrphanSources({
    objects: [{ bucketId: BUCKET, sourcePath: "x.xml" }],
    ledgerRecords: [
      record("x.xml", {
        discovery_kind: "referenced",
        status: "references_updated",
        destination_path: "otro/x.xml",
      }),
    ],
    approvedOwners: [],
    existingObjectKeys: new Set([storageObjectKey(BUCKET, "otro/x.xml")]),
    activeOrganizationIds: ACTIVE,
  });
  assertEquals(referencedWrongDestination.by_reason.destination_mismatch, 1);
});

Deno.test("bloquea organizaciones desconocidas y naturalezas inesperadas", () => {
  const unknownOrg = classifyReconciledOrphanSources({
    objects: [{ bucketId: BUCKET, sourcePath: "x.xml" }],
    ledgerRecords: [record("x.xml", { organization_id: OTHER_ORG })],
    approvedOwners: [owner("x.xml", OTHER_ORG)],
    existingObjectKeys: destinationExists("x.xml", OTHER_ORG),
    activeOrganizationIds: ACTIVE,
  });
  assertEquals(unknownOrg.by_reason.unknown_organization, 1);

  const unexpectedKind = classifyReconciledOrphanSources({
    objects: [{ bucketId: BUCKET, sourcePath: "x.xml" }],
    ledgerRecords: [record("x.xml", { discovery_kind: "manual" })],
    approvedOwners: [owner("x.xml")],
    existingObjectKeys: destinationExists("x.xml"),
    activeOrganizationIds: ACTIVE,
  });
  assertEquals(unexpectedKind.reconciled.length, 0);
  assertEquals(unexpectedKind.by_reason.unexpected_record_kind, 1);
});
