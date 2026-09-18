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
          return { data: { signedUrl: `signed:${bucket}/${path}` }, error: null };
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

  it("clasifica una imagen pública HTTPS como marca global de LiftGo", () => {
    // La marca del producto se comparte a propósito entre empresas: no es dato
    // de un tenant, no se firma y no requiere traslado a Storage.
    expect(classifyLogoSource("https://cdn.marca.example/liftgo.png")).toEqual({
      kind: "global-brand",
      url: "https://cdn.marca.example/liftgo.png",
    });
  });

  it("rechaza http en claro, data URI y rutas con salto de nivel", () => {
    expect(classifyLogoSource("http://cdn.marca.example/liftgo.png").kind)
      .toBe("unsupported");
    expect(classifyLogoSource("data:image/png;base64,AAA").kind).toBe("unsupported");
    expect(classifyLogoSource(`${ORG_A}/../${ORG_B}/logo.png`).kind).toBe("unsupported");
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

  it("la marca global se devuelve tal cual y NUNCA se firma", async () => {
    const { client, calls } = makeClient();
    const src = await resolveLogoSrc("https://cdn.marca.example/liftgo.png", { client });
    expect(src).toBe("https://cdn.marca.example/liftgo.png");
    expect(calls).toHaveLength(0);
  });

  it("no descarga ni firma esquemas no soportados (fail-closed)", async () => {
    const { client, calls } = makeClient();
    expect(await resolveLogoSrc("data:image/png;base64,AAA", { client })).toBeNull();
    expect(await resolveLogoSrc("http://cdn.marca.example/liftgo.png", { client })).toBeNull();
    expect(await resolveLogoSrc(`${ORG_A}/../${ORG_B}/logo.png`, { client })).toBeNull();
    expect(calls).toHaveLength(0);
  });

  it("devuelve null si la firma falla (p. ej. ruta de otra organización)", async () => {
    const client = {
      storage: {
        from: () => ({
          createSignedUrl: async () => ({ data: null, error: { message: "denied" } }),
        }),
      },
    };
    expect(await resolveLogoSrc(`${ORG_B}/company/logo.png`, { client })).toBeNull();
  });
});
