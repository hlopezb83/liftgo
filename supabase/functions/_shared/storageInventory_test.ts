import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  partitionStorageList,
  summarizeStorageInventory,
} from "./storageInventory.ts";

Deno.test("storageInventory: recorre objetos y carpetas sin aceptar segmentos inseguros", () => {
  assertEquals(
    partitionStorageList("legacy", [
      { id: null, name: "nested" },
      { id: "object-1", name: "invoice.xml" },
      { id: "object-2", name: "../escape.xml" },
      { id: "object-3", name: "nested/invalid.xml" },
      { id: "object-4", name: "back\\slash.xml" },
    ]),
    {
      folders: ["legacy/nested"],
      objectPaths: ["legacy/invoice.xml"],
    },
  );
});

const ORG = "2f3d0e7a-9b8c-4a56-8a22-41d9e8f0c123";
const OTHER_ORG = "3f3d0e7a-9b8c-4a56-8a22-41d9e8f0c123";

Deno.test("storageInventory: resume sólo contadores y deduplica rutas", () => {
  assertEquals(
    summarizeStorageInventory(
      "cfdi-files",
      ["legacy/a.xml", "legacy/a.xml", "legacy/b.xml"],
      ["legacy/a.xml", "missing.xml"],
    ),
    {
      bucket: "cfdi-files",
      objects: 2,
      referenced_objects: 1,
      unreferenced_objects: 1,
      unreferenced_scoped_objects: 0,
      unreferenced_unscoped_objects: 1,
    },
  );
});

Deno.test("storageInventory: separa huérfanos ya prefijados de los legados", () => {
  assertEquals(
    summarizeStorageInventory(
      "cfdi-files",
      [
        `${ORG}/referenciado.xml`,
        `${ORG}/huerfano.xml`,
        `${OTHER_ORG}/huerfano.xml`,
        "legacy/huerfano.xml",
      ],
      [`${ORG}/referenciado.xml`],
      [ORG, OTHER_ORG],
    ),
    {
      bucket: "cfdi-files",
      objects: 4,
      referenced_objects: 1,
      unreferenced_objects: 3,
      unreferenced_scoped_objects: 2,
      unreferenced_unscoped_objects: 1,
    },
  );
});

Deno.test("storageInventory: sin organizaciones conocidas nada cuenta como prefijado", () => {
  const summary = summarizeStorageInventory(
    "documents",
    [`${ORG}/huerfano.pdf`],
    [],
  );
  assertEquals(summary.unreferenced_scoped_objects, 0);
  assertEquals(summary.unreferenced_unscoped_objects, 1);
});

Deno.test("storageInventory: un prefijo parecido pero de otra organización no cuenta como aislado", () => {
  const summary = summarizeStorageInventory(
    "documents",
    ["4f3d0e7a-9b8c-4a56-8a22-41d9e8f0c123/huerfano.pdf"],
    [],
    [ORG],
  );
  assertEquals(summary.unreferenced_scoped_objects, 0);
  assertEquals(summary.unreferenced_unscoped_objects, 1);
});
