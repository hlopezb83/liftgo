/**
 * Helper para mockear el cliente de Supabase en tests Vitest.
 *
 * Construye un proxy "chainable" que acepta cualquier método encadenado
 * (.from().select().eq().order().limit().single().maybeSingle()...) y resuelve
 * al final con la respuesta que indiques.
 *
 * Uso típico:
 *
 *   const resp = vi.fn().mockResolvedValue({ data: null, error: { code: "42501" } });
 *   vi.mock("@/integrations/supabase/client", () => ({
 *     supabase: createSupabaseChainMock(resp),
 *   }));
 */
import { vi } from "vitest";

export type SupabaseMockResponse = {
  data: unknown;
  error: { code?: string; message: string } | null;
};

type Resolver = () => Promise<SupabaseMockResponse> | SupabaseMockResponse;

export function createChainable(resolver: Resolver) {
  const chain: Record<string | symbol, unknown> = {};
  const proxy = new Proxy(chain, {
    get(_target, prop) {
      if (prop === "then") {
        return (onFulfilled: (v: SupabaseMockResponse) => unknown) =>
          Promise.resolve(resolver()).then(onFulfilled);
      }
      return () => proxy;
    },
  });
  return proxy;
}

export function createSupabaseChainMock(opts: {
  fromResolver?: Resolver;
  rpcResolver?: Resolver;
  storageSignedUrl?: () => Promise<{ data: { signedUrl: string } | null }>;
}) {
  const fromR = opts.fromResolver ?? (() => ({ data: [], error: null }));
  const rpcR = opts.rpcResolver ?? (() => ({ data: null, error: null }));
  return {
    from: vi.fn(() => createChainable(fromR)),
    rpc: vi.fn(() => Promise.resolve(rpcR())),
    storage: {
      from: vi.fn(() => ({
        createSignedUrl:
          opts.storageSignedUrl ??
          vi.fn(async () => ({ data: { signedUrl: "https://signed/url" } })),
      })),
    },
  };
}
