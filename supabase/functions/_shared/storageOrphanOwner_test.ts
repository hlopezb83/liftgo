import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  buildOrphanOwnerIndex,
  resolveOrphanOwner,
  summarizeOrphanOwnership,
} from "./storageOrphanOwner.ts";

const ORG_A = "11111111-1111-4111-8111-111111111111";
const ORG_B = "22222222-2222-4222-8222-222222222222";
const BILL_A = "33333333-3333-4333-8333-333333333333";
const BILL_B = "44444444-4444-4444-8444-444444444444";
const CFDI_A = "55555555-5555-4555-8555-555555555555";
const CFDI_DUP = "66666666-6666-4666-8666-666666666666";
const UNKNOWN = "77777777-7777-4777-8777-777777777777";

const index = buildOrphanOwnerIndex([
  { id: BILL_A, cfdiUuid: CFDI_A, organizationId: ORG_A },
  { id: BILL_B, cfdiUuid: CFDI_DUP, organizationId: ORG_A },
  { id: UNKNOWN, cfdiUuid: CFDI_DUP, organizationId: ORG_B },
], {
  cfdiUuid: [CFDI_A, CFDI_DUP, UNKNOWN],
  id: [BILL_A, BILL_B, UNKNOWN],
});


const known = [ORG_A];

Deno.test("resuelve el dueño por UUID fiscal del CFDI", () => {
  const result = resolveOrphanOwner({
    bucketId: "supplier-bill-cfdi-xml",
    sourcePath: `${CFDI_A}/1700000000000-factura.xml`,
    index,
    knownOrganizationIds: known,
  });
  assertEquals(result, {
    status: "resolved",
    organizationId: ORG_A,
    method: "supplier_bill_cfdi_uuid",
  });
});

Deno.test("resuelve el dueño por id de factura de proveedor", () => {
  const result = resolveOrphanOwner({
    bucketId: "supplier-payment-receipts",
    sourcePath: `${BILL_A}/1700000000000-abc.pdf`,
    index,
    knownOrganizationIds: known,
  });
  assertEquals(result, {
    status: "resolved",
    organizationId: ORG_A,
    method: "supplier_bill_id",
  });
});

Deno.test("sin coincidencia deja el huérfano sin dueño", () => {
  assertEquals(
    resolveOrphanOwner({
      bucketId: "supplier-bill-cfdi-xml",
      sourcePath: `${UNKNOWN}/archivo.xml`,
      index,
      knownOrganizationIds: known,
    }),
    { status: "unresolved", reason: "no_match" },
  );
});

Deno.test("varias filas dueñas con distinta organización es conflicto", () => {
  assertEquals(
    resolveOrphanOwner({
      bucketId: "supplier-bill-cfdi-xml",
      sourcePath: `${CFDI_DUP}/archivo.xml`,
      index,
      knownOrganizationIds: [ORG_A, ORG_B],
    }),
    { status: "conflict", reason: "multiple_organizations" },
  );
});

Deno.test("varias filas dueñas de la misma organización es conflicto", () => {
  const duplicated = buildOrphanOwnerIndex([
    { id: BILL_A, cfdiUuid: CFDI_A, organizationId: ORG_A },
    { id: BILL_B, cfdiUuid: CFDI_A, organizationId: ORG_A },
  ]);
  assertEquals(
    resolveOrphanOwner({
      bucketId: "supplier-bill-cfdi-xml",
      sourcePath: `${CFDI_A}/archivo.xml`,
      index: duplicated,
      knownOrganizationIds: known,
    }),
    { status: "conflict", reason: "multiple_owner_rows" },
  );
});

Deno.test("organización desconocida no se asigna", () => {
  assertEquals(
    resolveOrphanOwner({
      bucketId: "supplier-bill-cfdi-xml",
      sourcePath: `${CFDI_A}/archivo.xml`,
      index,
      knownOrganizationIds: [ORG_B],
    }),
    { status: "unresolved", reason: "unknown_organization" },
  );
});

Deno.test("otros buckets no tienen resolución soportada", () => {
  for (const bucketId of ["cfdi-files", "documents", "feedback-screenshots"]) {
    assertEquals(
      resolveOrphanOwner({
        bucketId,
        sourcePath: `${CFDI_A}/archivo.xml`,
        index,
        knownOrganizationIds: known,
      }),
      { status: "unresolved", reason: "unsupported_bucket" },
    );
  }
});

Deno.test("ruta sin carpeta o con segmento no UUID no resuelve", () => {
  for (const sourcePath of ["archivo.xml", "sin-uuid/archivo.xml"]) {
    assertEquals(
      resolveOrphanOwner({
        bucketId: "supplier-bill-cfdi-xml",
        sourcePath,
        index,
        knownOrganizationIds: known,
      }),
      { status: "unresolved", reason: "invalid_path" },
    );
  }
});

Deno.test("el resumen sólo expone conteos agregados por bucket", () => {
  const summary = summarizeOrphanOwnership([
    {
      bucketId: "supplier-bill-cfdi-xml",
      resolution: {
        status: "resolved",
        organizationId: ORG_A,
        method: "supplier_bill_cfdi_uuid",
      },
    },
    {
      bucketId: "supplier-bill-cfdi-xml",
      resolution: { status: "unresolved", reason: "no_match" },
    },
    {
      bucketId: "supplier-payment-receipts",
      resolution: { status: "conflict", reason: "multiple_owner_rows" },
    },
  ]);
  assertEquals(summary, [
    {
      bucket: "supplier-bill-cfdi-xml",
      unreferenced_unscoped_objects: 2,
      owner_resolved: 1,
      owner_missing: 1,
      owner_conflicting: 0,
    },
    {
      bucket: "supplier-payment-receipts",
      unreferenced_unscoped_objects: 1,
      owner_resolved: 0,
      owner_missing: 0,
      owner_conflicting: 1,
    },
  ]);
});
