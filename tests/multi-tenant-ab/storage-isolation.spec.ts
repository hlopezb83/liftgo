import { expect, test } from "@playwright/test";
import { AB_BUCKET, AB_ORG_A, AB_ORG_B } from "./fixtures/abIdentities";
import { readAbContext } from "./fixtures/abSeed";
import { isStorageDenial } from "./fixtures/denialContract";
import { createLocalUserClient } from "./fixtures/localBackend";

const ctx = readAbContext();
function folder(path: string): string { return path.split("/").slice(0, -1).join("/"); }

for (const [label, own, foreign, slug] of [
  ["A", ctx.A, ctx.B, AB_ORG_A.slug], ["B", ctx.B, ctx.A, AB_ORG_B.slug],
] as const) {
  test.describe(`storage ${label} → empresa ajena`, () => {
    test("descarga propia tiene contenido exacto y el objeto ajeno existe para su dueño", async () => {
      const client = await createLocalUserClient(label, own.internal.email, own.internal.password);
      const result = await client.storage.from(AB_BUCKET).download(own.storagePath);
      expect(result.error).toBeNull();
      expect(await result.data?.text()).toBe(`documento sintetico de ${slug}`);
      const owner = await createLocalUserClient("propietario", foreign.internal.email, foreign.internal.password);
      const positive = await owner.storage.from(AB_BUCKET).download(foreign.storagePath);
      expect(positive.error).toBeNull();
      expect(positive.data?.size).toBeGreaterThan(0);
    });

    test("listado propio funciona y el prefijo ajeno devuelve vacío sin errores", async () => {
      const client = await createLocalUserClient(label, own.internal.email, own.internal.password);
      const positive = await client.storage.from(AB_BUCKET).list(folder(own.storagePath));
      expect(positive.error).toBeNull();
      expect(positive.data?.map((item) => item.name)).toContain("factura.txt");
      const denied = await client.storage.from(AB_BUCKET).list(folder(foreign.storagePath));
      expect(denied.error).toBeNull();
      expect(denied.data).toEqual([]);
    });

    test("descarga y firma propias funcionan; las ajenas cumplen el contrato de denegación", async () => {
      const client = await createLocalUserClient(label, own.internal.email, own.internal.password);
      const positive = await client.storage.from(AB_BUCKET).createSignedUrl(own.storagePath, 60);
      expect(positive.error).toBeNull();
      expect(positive.data?.signedUrl).toBeTruthy();
      const download = await client.storage.from(AB_BUCKET).download(foreign.storagePath);
      expect(isStorageDenial(download.error, "read"), download.error?.message).toBe(true);
      expect(download.data).toBeNull();
      const signed = await client.storage.from(AB_BUCKET).createSignedUrl(foreign.storagePath, 60);
      expect(isStorageDenial(signed.error, "read"), signed.error?.message).toBe(true);
      expect(signed.data?.signedUrl).toBeUndefined();
    });

    test("upload propio funciona y el mismo upload ajeno falla por permisos", async () => {
      const client = await createLocalUserClient(label, own.internal.email, own.internal.password);
      const path = `${own.organizationId}/ab-gate/control-${label}.txt`;
      try {
        const positive = await client.storage.from(AB_BUCKET).upload(path, new Blob(["control"], { type: "text/plain" }));
        expect(positive.error).toBeNull();
        const foreignPath = `${foreign.organizationId}/ab-gate/intruso-${label}.txt`;
        const denied = await client.storage.from(AB_BUCKET).upload(foreignPath, new Blob(["control"], { type: "text/plain" }));
        expect(isStorageDenial(denied.error, "write"), denied.error?.message).toBe(true);
        const owner = await createLocalUserClient("propietario", foreign.internal.email, foreign.internal.password);
        const after = await owner.storage.from(AB_BUCKET).list(folder(foreignPath));
        expect(after.error).toBeNull();
        expect(after.data?.map((item) => item.name)).not.toContain(`intruso-${label}.txt`);
      } finally {
        const cleanup = await client.storage.from(AB_BUCKET).remove([path]);
        expect(cleanup.error).toBeNull();
      }
    });

    test("objeto legado sin prefijo sigue oculto sin aceptar fallos de infraestructura", async () => {
      const client = await createLocalUserClient(label, own.internal.email, own.internal.password);
      const download = await client.storage.from(AB_BUCKET).download(ctx.legacyObjectPath);
      expect(isStorageDenial(download.error, "read"), download.error?.message).toBe(true);
      const signed = await client.storage.from(AB_BUCKET).createSignedUrl(ctx.legacyObjectPath, 60);
      expect(isStorageDenial(signed.error, "read"), signed.error?.message).toBe(true);
      const listed = await client.storage.from(AB_BUCKET).list(folder(ctx.legacyObjectPath));
      expect(listed.error).toBeNull();
      expect(listed.data).toEqual([]);
    });
  });
}
