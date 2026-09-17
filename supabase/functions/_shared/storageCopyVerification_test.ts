import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { compareCopy, digestBytes } from "./storageCopyVerification.ts";

const bytesOf = (text: string) => new TextEncoder().encode(text);

Deno.test("storageCopyVerification: el digest es estable y depende del contenido", async () => {
  const a = await digestBytes(bytesOf("factura"));
  const b = await digestBytes(bytesOf("factura"));
  const c = await digestBytes(bytesOf("facturA"));

  assertEquals(a.size, 7);
  assertEquals(a.sha256.length, 64);
  assertEquals(a.sha256, b.sha256);
  assertEquals(a.sha256 === c.sha256, false);
});

Deno.test("storageCopyVerification: copia idéntica se verifica", async () => {
  const source = await digestBytes(bytesOf("contenido fiscal"));
  const destination = await digestBytes(bytesOf("contenido fiscal"));
  assertEquals(compareCopy(source, destination), "verified");
});

Deno.test("storageCopyVerification: detecta diferencia de tamaño y de contenido", async () => {
  const source = await digestBytes(bytesOf("contenido fiscal"));
  const truncated = await digestBytes(bytesOf("contenido"));
  assertEquals(compareCopy(source, truncated), "copy_size_mismatch");

  const sameSizeOtherBytes = await digestBytes(bytesOf("contenido fiscaL"));
  assertEquals(
    compareCopy(source, sameSizeOtherBytes),
    "copy_digest_mismatch",
  );
});

Deno.test("storageCopyVerification: falla cerrado si falta cualquiera de los dos lados", async () => {
  const digest = await digestBytes(bytesOf("x"));
  assertEquals(compareCopy(null, digest), "source_missing");
  assertEquals(compareCopy(digest, null), "destination_missing");
  assertEquals(compareCopy(null, null), "source_missing");
});

Deno.test("storageCopyVerification: un archivo vacío no equivale a uno con contenido", async () => {
  const empty = await digestBytes(new Uint8Array(0));
  const filled = await digestBytes(bytesOf("a"));
  assertEquals(compareCopy(filled, empty), "copy_size_mismatch");
  assertEquals(compareCopy(empty, empty), "verified");
});
