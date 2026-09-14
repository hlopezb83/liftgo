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
    },
  );
});
