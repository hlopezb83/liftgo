import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  destinationReferenceValue,
  makeStorageMigrationPlan,
  parseStorageReference,
} from "./storageMigrationPlan.ts";

const ORG = "2f3d0e7a-9b8c-4a56-8a22-41d9e8f0c123";
const OTHER_ORG = "3f3d0e7a-9b8c-4a56-8a22-41d9e8f0c123";

Deno.test("storageMigrationPlan: migra una ruta relativa legada", () => {
  assertEquals(
    makeStorageMigrationPlan(ORG, "cfdi-files", "invoice-1/fiscal.xml"),
    {
      disposition: "candidate",
      sourcePath: "invoice-1/fiscal.xml",
      destinationPath: `${ORG}/invoice-1/fiscal.xml`,
      format: "storage_path",
      publicUrlOrigin: null,
    },
  );
});

Deno.test("storageMigrationPlan: conserva el formato bucket/path de documentos", () => {
  const plan = makeStorageMigrationPlan(
    ORG,
    "documents",
    "documents/a/file.pdf",
  );
  assertEquals(plan.format, "bucket_path");
  assertEquals(
    destinationReferenceValue(
      "documents",
      plan.destinationPath!,
      plan.format!,
      plan.publicUrlOrigin,
    ),
    `documents/${ORG}/a/file.pdf`,
  );
});

Deno.test("storageMigrationPlan: reescribe una URL pública sin query ni secreto", () => {
  const source =
    "https://project.supabase.co/storage/v1/object/public/supplier-bill-cfdi-xml/folder/archivo%20fiscal.xml";
  const plan = makeStorageMigrationPlan(ORG, "supplier-bill-cfdi-xml", source);

  assertEquals(plan.disposition, "candidate");
  assertEquals(plan.sourcePath, "folder/archivo fiscal.xml");
  assertEquals(
    destinationReferenceValue(
      "supplier-bill-cfdi-xml",
      plan.destinationPath!,
      plan.format!,
      plan.publicUrlOrigin,
    ),
    `https://project.supabase.co/storage/v1/object/public/supplier-bill-cfdi-xml/${ORG}/folder/archivo%20fiscal.xml`,
  );
});

Deno.test("storageMigrationPlan: no toca rutas ya aisladas y bloquea otro prefijo", () => {
  assertEquals(
    makeStorageMigrationPlan(ORG, "cfdi-files", `${ORG}/invoice/a.xml`)
      .disposition,
    "already_scoped",
  );
  assertEquals(
    makeStorageMigrationPlan(
      ORG,
      "cfdi-files",
      `${OTHER_ORG}/invoice/a.xml`,
      [OTHER_ORG],
    ).disposition,
    "belongs_to_other_organization",
  );
});

Deno.test("storageMigrationPlan: no confunde UUIDs de entidades con organizaciones", () => {
  assertEquals(
    makeStorageMigrationPlan(
      ORG,
      "cfdi-files",
      "4f3d0e7a-9b8c-4a56-8a22-41d9e8f0c123/invoice.xml",
      [ORG],
    ).disposition,
    "candidate",
  );
});

Deno.test("storageMigrationPlan: rechaza URL firmada y rutas inseguras", () => {
  assertEquals(
    parseStorageReference(
      "https://project.supabase.co/storage/v1/object/sign/cfdi-files/a.xml?token=secret",
      "cfdi-files",
    ),
    null,
  );
  assertEquals(
    makeStorageMigrationPlan(ORG, "cfdi-files", "../a.xml").disposition,
    "unsupported",
  );
});
