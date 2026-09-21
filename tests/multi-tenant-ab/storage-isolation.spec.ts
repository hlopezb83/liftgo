/**
 * Aislamiento de STORAGE por la API real (storage-api local) con token de
 * usuario: listado, descarga, URL firmada y objeto legado sin prefijo.
 */

import { expect, test } from "@playwright/test";
import { AB_BUCKET } from "./fixtures/abIdentities";
import { readAbContext } from "./fixtures/abSeed";
import { createLocalUserClient } from "./fixtures/localBackend";

const ctx = readAbContext();

function folderOf(path: string): { prefix: string; name: string } {
  const parts = path.split("/");
  return { prefix: parts.slice(0, -1).join("/"), name: parts[parts.length - 1] };
}

test.describe("storage A/B", () => {
  test("A descarga su propio objeto", async () => {
    const client = await createLocalUserClient("internalA", ctx.A.internal.email, ctx.A.internal.password);
    const { data, error } = await client.storage.from(AB_BUCKET).download(ctx.A.storagePath);
    expect(error).toBeNull();
    expect(data).not.toBeNull();
  });

  test("A no lista el prefijo de B", async () => {
    const client = await createLocalUserClient("internalA", ctx.A.internal.email, ctx.A.internal.password);
    const { prefix } = folderOf(ctx.B.storagePath);
    const { data } = await client.storage.from(AB_BUCKET).list(prefix);
    expect(data ?? []).toHaveLength(0);
  });

  test("A no descarga el objeto de B", async () => {
    const client = await createLocalUserClient("internalA", ctx.A.internal.email, ctx.A.internal.password);
    const { data, error } = await client.storage.from(AB_BUCKET).download(ctx.B.storagePath);
    expect(error).not.toBeNull();
    expect(data).toBeNull();
  });

  test("A no obtiene URL firmada del objeto de B", async () => {
    const client = await createLocalUserClient("internalA", ctx.A.internal.email, ctx.A.internal.password);
    const { data, error } = await client.storage.from(AB_BUCKET).createSignedUrl(ctx.B.storagePath, 60);
    expect(error).not.toBeNull();
    expect(data?.signedUrl).toBeUndefined();
  });

  test("A no puede escribir dentro del prefijo de B", async () => {
    const client = await createLocalUserClient("internalA", ctx.A.internal.email, ctx.A.internal.password);
    const { error } = await client.storage
      .from(AB_BUCKET)
      .upload(`${ctx.B.organizationId}/ab-gate/intruso.txt`, new Blob(["x"], { type: "text/plain" }));
    expect(error).not.toBeNull();
  });

  test("el objeto legado sin prefijo no es accesible por A ni por B", async () => {
    for (const side of [ctx.A, ctx.B]) {
      const client = await createLocalUserClient("internal", side.internal.email, side.internal.password);
      const download = await client.storage.from(AB_BUCKET).download(ctx.legacyObjectPath);
      expect(download.error).not.toBeNull();
      const signed = await client.storage.from(AB_BUCKET).createSignedUrl(ctx.legacyObjectPath, 60);
      expect(signed.error).not.toBeNull();
      const { prefix } = folderOf(ctx.legacyObjectPath);
      const listed = await client.storage.from(AB_BUCKET).list(prefix);
      expect(listed.data ?? []).toHaveLength(0);
    }
  });
});
