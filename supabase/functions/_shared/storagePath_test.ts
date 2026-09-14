import {
  assertEquals,
  assertThrows,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  hasOrganizationStoragePrefix,
  organizationStoragePath,
} from "./storagePath.ts";

const ORGANIZATION_ID = "2f3d0e7a-9b8c-4a56-8a22-41d9e8f0c123";

Deno.test("storagePath: antepone la organización y normaliza la barra inicial", () => {
  assertEquals(
    organizationStoragePath(ORGANIZATION_ID, "/cfdi/invoice.xml"),
    `${ORGANIZATION_ID}/cfdi/invoice.xml`,
  );
});

Deno.test("storagePath: rechaza identificador o ruta insegura", () => {
  assertThrows(
    () => organizationStoragePath("not-a-uuid", "cfdi/invoice.xml"),
    Error,
    "organización válida",
  );
  assertThrows(
    () => organizationStoragePath(ORGANIZATION_ID, "../invoice.xml"),
    Error,
    "no puede contener",
  );
});

Deno.test("storagePath: reconoce únicamente el prefijo exacto de la organización", () => {
  assertEquals(
    hasOrganizationStoragePrefix(ORGANIZATION_ID, `${ORGANIZATION_ID}/cfdi/invoice.xml`),
    true,
  );
  assertEquals(
    hasOrganizationStoragePrefix(ORGANIZATION_ID, "invoice.xml"),
    false,
  );
  assertEquals(
    hasOrganizationStoragePrefix(ORGANIZATION_ID, `${ORGANIZATION_ID}-otro/invoice.xml`),
    false,
  );
});
