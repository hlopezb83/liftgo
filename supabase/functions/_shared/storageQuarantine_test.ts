import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { summarizeQuarantine } from "./storageQuarantine.ts";
import { summarizeOrphanOwnership } from "./storageOrphanOwner.ts";

const ORG = "2f3d0e7a-9b8c-4a56-8a22-41d9e8f0c123";

const entries = [
  {
    bucketId: "supplier-bill-cfdi-xml",
    resolution: {
      status: "resolved" as const,
      organizationId: ORG,
      method: "supplier_bill_cfdi_uuid" as const,
    },
  },
  {
    bucketId: "supplier-bill-cfdi-xml",
    resolution: { status: "unresolved" as const, reason: "no_match" as const },
  },
  {
    bucketId: "supplier-bill-cfdi-xml",
    resolution: {
      status: "unresolved" as const,
      reason: "incomplete_lookup" as const,
    },
  },
  {
    bucketId: "supplier-payment-receipts",
    resolution: {
      status: "conflict" as const,
      reason: "multiple_organizations" as const,
    },
  },
  {
    bucketId: "cfdi-files",
    resolution: {
      status: "unresolved" as const,
      reason: "unsupported_bucket" as const,
    },
  },
];

Deno.test("storageQuarantine: separa lo listo de lo que exige decisión manual", () => {
  const summary = summarizeQuarantine(entries, summarizeOrphanOwnership(entries));
  assertEquals(summary.ready, 1);
  assertEquals(summary.total, 4);
  assertEquals(summary.by_reason, {
    owner_not_found: 1,
    owner_conflict: 1,
    unknown_organization: 0,
    incomplete_lookup: 1,
    unsupported_bucket: 1,
    invalid_path: 0,
  });
  assertEquals(
    summary.by_bucket.sort((a, b) => a.bucket.localeCompare(b.bucket)),
    [
      { bucket: "cfdi-files", quarantined: 1 },
      { bucket: "supplier-bill-cfdi-xml", quarantined: 2 },
      { bucket: "supplier-payment-receipts", quarantined: 1 },
    ],
  );
});

Deno.test("storageQuarantine: una lectura incompleta nunca cuenta como lista", () => {
  const summary = summarizeQuarantine([
    {
      bucketId: "supplier-bill-cfdi-xml",
      resolution: {
        status: "unresolved",
        reason: "incomplete_lookup",
      },
    },
  ]);
  assertEquals(summary.ready, 0);
  assertEquals(summary.total, 1);
  assertEquals(summary.by_reason.incomplete_lookup, 1);
});

Deno.test("storageQuarantine: sin objetos no hay cuarentena ni rutas expuestas", () => {
  const summary = summarizeQuarantine([]);
  assertEquals(summary.total, 0);
  assertEquals(summary.ready, 0);
  assertEquals(summary.by_bucket, []);
});
