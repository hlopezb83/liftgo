// Verifica MANIFEST.json contra los archivos del checkout (requiere sólo
// --allow-read sobre esta carpeta). Falla si falta un archivo (p. ej. deno.lock).
import { assertEquals } from "@std/assert";

const root = new URL("../", import.meta.url);

async function sha256Hex(bytes: Uint8Array<ArrayBuffer>) {
  const d = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.test("manifiesto: cada archivo existe, hashes y closure_sha256 coinciden", async () => {
  const m = JSON.parse(await Deno.readTextFile(new URL("MANIFEST.json", root)));
  const files: Array<{ path: string; sha256: string }> = Array.isArray(m.files)
    ? m.files
    : Object.entries(m.files).map(([path, sha256]) => ({ path, sha256: sha256 as string }));
  assertEquals(files.length, m.file_count);
  let joined = "";
  for (const f of files) {
    const bytes = (await Deno.readFile(new URL(`snapshot/${f.path}`, root))) as Uint8Array<ArrayBuffer>;
    assertEquals(await sha256Hex(bytes), f.sha256, f.path);
    joined += `${f.path}:${f.sha256}\n`;
  }
  assertEquals(await sha256Hex(new TextEncoder().encode(joined)), m.closure_sha256);
  assertEquals(files.some((f) => f.path.endsWith("functions/deno.lock")), true);
});
