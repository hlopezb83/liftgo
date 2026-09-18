import { describe, expect, it, vi } from "vitest";
import { classifyLogoSource, resolveLogoSrc } from "../logoSource";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));

const ORG_A = "11111111-1111-4111-8111-111111111111";
const ORG_B = "22222222-2222-4222-8222-222222222222";

function makeClient() {
  const calls: { bucket: string; path: string; ttl: number }[] = [];
  const client = {
    storage: {
      from: (bucket: string) => ({
        createSignedUrl: async (path: string, ttl: number) => {
          calls.push({ bucket, path, ttl });
          // Simula RLS: cada organización sólo puede firmar su propio prefijo.
          return {
            data: { signedUrl: `signed:${bucket}/${path}` },
            error: null,
          };
        },
      }),
    },
  };
  return { client, calls };
}

describe("classifyLogoSource", () => {
  it("acepta una ruta relativa de Storage", () => {
    expect(classifyLogoSource(`${ORG_A}/company/logo.png`)).toEqual({
      kind: "storage",
      bucket: "documents",
      path: `${ORG_A}/company/logo.png`,
    });
  });

  it("rechaza CUALQUIER HTTPS ajeno al Storage de este proyecto", () => {
    // Regresión: un HTTPS no reconocido no puede degradarse a marca global ni
    // renderizarse; la marca del producto sale de un asset local fijo.
    for (const url of [
      "https://cdn.ajeno.example/logo.png",
      "https://ajeno.example/a/b/c/logo.png?token=x",
      "https://ajeno.example/storage/v1/object/public/documents/logo.png",
      "https://user:pass@ajeno.example/logo.png",
    ]) {
      expect(classifyLogoSource(url).kind).toBe("unsupported");
    }
  });

  it("rechaza http en claro, data URI y rutas con salto de nivel", () => {
    expect(classifyLogoSource("http://cdn.marca.example/liftgo.png").kind).toBe(
      "unsupported",
    );
    expect(classifyLogoSource("data:image/png;base64,AAA").kind).toBe(
      "unsupported",
    );
    expect(classifyLogoSource(`${ORG_A}/../${ORG_B}/logo.png`).kind).toBe(
      "unsupported",
    );
    expect(classifyLogoSource("").kind).toBe("unsupported");
    expect(classifyLogoSource(null).kind).toBe("unsupported");
  });
});

describe("resolveLogoSrc — aislamiento entre empresas", () => {
  it("la empresa A sólo firma su ruta y la B sólo la suya", async () => {
    const { client, calls } = makeClient();
    const a = await resolveLogoSrc(`${ORG_A}/company/logo.png`, { client });
    const b = await resolveLogoSrc(`${ORG_B}/company/logo.png`, { client });

    expect(a).toContain(`${ORG_A}/company/logo.png`);
    expect(a).not.toContain(ORG_B);
    expect(b).toContain(`${ORG_B}/company/logo.png`);
    expect(b).not.toContain(ORG_A);
    expect(calls.map((c) => c.path)).toEqual([
      `${ORG_A}/company/logo.png`,
      `${ORG_B}/company/logo.png`,
    ]);
    expect(calls.every((c) => c.bucket === "documents")).toBe(true);
    expect(calls.every((c) => c.ttl <= 300)).toBe(true);
  });

  it("no descarga ni firma esquemas no soportados (fail-closed)", async () => {
    const { client, calls } = makeClient();
    expect(
      await resolveLogoSrc("data:image/png;base64,AAA", { client }),
    ).toBeNull();
    expect(
      await resolveLogoSrc("http://cdn.marca.example/liftgo.png", { client }),
    ).toBeNull();
    expect(
      await resolveLogoSrc(`${ORG_A}/../${ORG_B}/logo.png`, { client }),
    ).toBeNull();
    expect(calls).toHaveLength(0);
  });

  it("devuelve null si la firma falla (p. ej. ruta de otra organización)", async () => {
    const client = {
      storage: {
        from: () => ({
          createSignedUrl: async () => ({
            data: null,
            error: { message: "denied" },
          }),
        }),
      },
    };
    expect(
      await resolveLogoSrc(`${ORG_B}/company/logo.png`, { client }),
    ).toBeNull();
  });
});
